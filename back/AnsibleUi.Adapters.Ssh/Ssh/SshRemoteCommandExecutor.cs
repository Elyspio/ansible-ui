using System.Text;
using AnsibleUi.Abstractions;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Renci.SshNet;

namespace AnsibleUi.Adapters.Ssh.Ssh;

/// <summary>SSH transport for POSIX scripts on the Rebond.</summary>
public sealed class SshRemoteCommandExecutor(IOptions<SshConnectionOptions> options, ILogger<SshRemoteCommandExecutor> logger) : IRemoteCommandExecutor
{
	private readonly SshConnectionOptions _options = options.Value;

	public async Task<RemoteCommandResult> ExecuteAsync(string script, CancellationToken ct = default)
	{
		using var client = await ConnectAsync(ct);
		using var command = client.CreateCommand($"sh -c {PosixShell.Quote(script)}");
		var stdout = await Task.Factory.FromAsync(command.BeginExecute(), command.EndExecute).WaitAsync(ct);
		return Result(command, stdout);
	}

	public async Task<RemoteCommandResult> ExecuteStreamingAsync(string script, Func<string, Task> onOutput, CancellationToken ct = default)
	{
		using var client = await ConnectAsync(ct);
		var wrappedScript = "echo \"__ANSIBLE_UI_PID__=$$\"; " + script;
		using var command = client.CreateCommand($"sh -c {PosixShell.Quote(wrappedScript)}");
		var asyncResult = command.BeginExecute();
		int? remotePid = null;
		var stdout = new StringBuilder();

		await using var registration = ct.Register(() =>
		{
			if (remotePid is { } pid)
				_ = KillRemoteProcessAsync(pid);
			client.Disconnect();
		});

		using var reader = new StreamReader(command.OutputStream, Encoding.UTF8);
		var chunk = new char[4096];
		var pending = new StringBuilder();
		while (true)
		{
			var read = await reader.ReadAsync(chunk.AsMemory(), CancellationToken.None);
			if (read == 0)
			{
				if (asyncResult.IsCompleted) break;
				await Task.Delay(50, CancellationToken.None);
				continue;
			}

			pending.Append(chunk, 0, read);
			while (true)
			{
				var text = pending.ToString();
				var newline = text.IndexOf('\n');
				if (newline < 0) break;
				var line = text[..(newline + 1)];
				pending.Remove(0, newline + 1);
				if (TryReadPid(line, out var pid))
				{
					remotePid = pid;
					continue;
				}
				stdout.Append(line);
				await onOutput(line);
			}
		}

		command.EndExecute(asyncResult);
		ct.ThrowIfCancellationRequested();
		if (pending.Length > 0)
		{
			var final = pending.ToString();
			if (!TryReadPid(final, out _))
			{
				stdout.Append(final);
				await onOutput(final);
			}
		}
		return Result(command, stdout.ToString());
	}

	private static bool TryReadPid(string line, out int pid)
	{
		pid = default;
		const string marker = "__ANSIBLE_UI_PID__=";
		var index = line.IndexOf(marker, StringComparison.Ordinal);
		return index >= 0 && int.TryParse(line[(index + marker.Length)..].Trim(), out pid);
	}

	private RemoteCommandResult Result(SshCommand command, string stdout)
	{
		var result = new RemoteCommandResult(stdout, command.Error, command.ExitStatus ?? -1);
		if (!result.Succeeded && !string.IsNullOrWhiteSpace(result.StandardError))
			logger.LogWarning("SSH command exited with {ExitCode}: {Error}", result.ExitCode, result.StandardError);
		return result;
	}

	private async Task KillRemoteProcessAsync(int pid)
	{
		try
		{
			using var client = await ConnectAsync(CancellationToken.None);
			client.RunCommand($"nohup sh -c 'kill -INT {pid} 2>/dev/null; sleep 10; kill -KILL {pid} 2>/dev/null' >/dev/null 2>&1 &");
		}
		catch (Exception e)
		{
			logger.LogError(e, "Failed to interrupt remote process {Pid}", pid);
		}
	}

	private async Task<SshClient> ConnectAsync(CancellationToken ct)
	{
		if (!File.Exists(_options.PrivateKeyPath))
			throw new FileNotFoundException($"SSH private key not found at '{_options.PrivateKeyPath}'", _options.PrivateKeyPath);
		var key = string.IsNullOrEmpty(_options.PrivateKeyPassphrase)
			? new PrivateKeyFile(_options.PrivateKeyPath)
			: new PrivateKeyFile(_options.PrivateKeyPath, _options.PrivateKeyPassphrase);
		var client = new SshClient(_options.Host, _options.Port, _options.User, key);
		await client.ConnectAsync(ct);
		return client;
	}
}
