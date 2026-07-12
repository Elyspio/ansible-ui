using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Renci.SshNet;

namespace AnsibleUi.Adapters.Ssh.Ssh;

/// <summary>IControlNode over SSH (one connection per operation).</summary>
public sealed partial class SshControlNode(IOptions<ControlNodeOptions> options, ILogger<SshControlNode> logger) : IControlNode
{
	private readonly ControlNodeOptions _options = options.Value;

	public async Task<string> GetRemoteRevisionAsync(CancellationToken ct = default)
	{
		var reference = $"refs/heads/{_options.RepositoryBranch}";
		var (stdout, exitCode) = await RunCommandAsync(
			$"git ls-remote --exit-code {Quote(_options.RepositoryUrl)} {Quote(reference)} 2>/dev/null", ct);
		if (exitCode != 0)
			throw new InvalidOperationException($"Remote branch '{_options.RepositoryBranch}' is unavailable");

		var revision = stdout.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
		return revision ?? throw new InvalidOperationException("Git server returned no revision");
	}

	public async Task SynchronizeRepositoryAsync(CancellationToken ct = default)
	{
		var repo = Quote(_options.RepoPath);
		var url = Quote(_options.RepositoryUrl);
		var branch = Quote(_options.RepositoryBranch);
		var parent = Quote(PosixParent(_options.RepoPath));
		var script =
			$"if [ -d {repo}/.git ]; then " +
			$"cd {repo} && git remote set-url origin {url} && " +
			$"git fetch --prune origin {branch} && " +
			$"git checkout -B {branch} origin/{branch} && git reset --hard origin/{branch}; " +
			$"elif [ -d {repo} ] && [ -z \"$(ls -A {repo})\" ]; then " +
			$"git clone --single-branch --branch {branch} {url} {repo}; " +
			$"elif [ -e {repo} ]; then echo 'Repository path exists but is not a Git clone' >&2; exit 1; " +
			$"else mkdir -p {parent} && git clone --single-branch --branch {branch} {url} {repo}; fi";

		var (_, exitCode) = await RunCommandAsync($"sh -c {Quote(script)}", ct);
		if (exitCode != 0)
			throw new InvalidOperationException("Failed to clone or reset the Ansible repository");
	}

	public async Task<string> GetLocalRevisionAsync(CancellationToken ct = default)
	{
		var (stdout, exitCode) = await RunCommandAsync(
			$"git -C {Quote(_options.RepoPath)} rev-parse HEAD 2>/dev/null", ct);
		if (exitCode != 0)
			throw new InvalidOperationException("The Ansible repository clone has no HEAD");
		return stdout.Trim();
	}

	public async Task<bool> HasTrackedChangesAsync(CancellationToken ct = default)
	{
		var (stdout, exitCode) = await RunCommandAsync(
			$"git -C {Quote(_options.RepoPath)} status --porcelain --untracked-files=no 2>/dev/null", ct);
		if (exitCode != 0)
			throw new InvalidOperationException("Could not inspect the Ansible repository working tree");
		return !string.IsNullOrWhiteSpace(stdout);
	}

	public async Task<bool> HasExpectedRepositoryConfigurationAsync(CancellationToken ct = default)
	{
		var (stdout, exitCode) = await RunCommandAsync(
			$"git -C {Quote(_options.RepoPath)} remote get-url origin 2>/dev/null && " +
			$"git -C {Quote(_options.RepoPath)} symbolic-ref --short HEAD 2>/dev/null", ct);
		if (exitCode != 0)
			return false;
		var lines = stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
		return lines.Length == 2 &&
			string.Equals(lines[0], _options.RepositoryUrl, StringComparison.Ordinal) &&
			string.Equals(lines[1], _options.RepositoryBranch, StringComparison.Ordinal);
	}

	public async Task<IReadOnlyList<Playbook>> ListPlaybooksAsync(CancellationToken ct = default)
	{
		var (stdout, _) = await RunCommandAsync(
			$"cd {Quote(_options.WorkingDirectory)} && find playbooks -type f \\( -name '*.yml' -o -name '*.yaml' \\) | sort", ct);

		return stdout
			.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
			.Select(path =>
			{
				var segments = path.Split('/');
				var name = Path.GetFileNameWithoutExtension(segments[^1]);
				var category = segments.Length > 2 ? segments[^2] : "base";
				return new Playbook(path, name, category);
			})
			.ToList();
	}

	public async Task<Inventory> GetInventoryAsync(CancellationToken ct = default)
	{
		var (stdout, exitCode) = await RunCommandAsync(
			$"cd {Quote(_options.WorkingDirectory)} && ansible-inventory --list 2>/dev/null", ct);
		if (exitCode != 0)
			throw new InvalidOperationException("ansible-inventory failed on the control node");

		// Keep only group structure; _meta.hostvars may contain decrypted vault values and must never leave the node.
		using var json = JsonDocument.Parse(stdout);
		var groups = new List<InventoryGroup>();
		var hosts = new SortedSet<string>(StringComparer.Ordinal);

		foreach (var property in json.RootElement.EnumerateObject())
		{
			if (property.Name is "_meta" or "all" or "ungrouped")
				continue;

			var groupHosts = ReadStringArray(property.Value, "hosts");
			var children = ReadStringArray(property.Value, "children");
			groups.Add(new InventoryGroup(property.Name, groupHosts, children));
			foreach (var host in groupHosts)
				hosts.Add(host);
		}

		if (json.RootElement.TryGetProperty("ungrouped", out var ungrouped))
			foreach (var host in ReadStringArray(ungrouped, "hosts"))
				hosts.Add(host);

		return new Inventory(groups, [.. hosts]);
	}

	public async Task<string?> GetHostVarsAsync(string host, CancellationToken ct = default)
	{
		if (!SafeHostName().IsMatch(host))
			throw HttpException.BadRequest($"Invalid host name '{host}'");

		// Raw file content: inline !vault blocks stay encrypted, unlike ansible-inventory output.
		var (stdout, exitCode) = await RunCommandAsync(
			$"cd {Quote(_options.WorkingDirectory)} && cat inventory/host_vars/{Quote(host)}/vars.yml 2>/dev/null", ct);
		return exitCode == 0 ? stdout : null;
	}

	public async Task<int> ExecutePlaybookAsync(string playbook, RunOptions runOptions, Func<string, Task> onOutput, CancellationToken ct)
	{
		var arguments = new StringBuilder($"ansible-playbook {Quote(playbook)}");
		if (!string.IsNullOrWhiteSpace(runOptions.Limit))
			arguments.Append($" --limit {Quote(runOptions.Limit)}");
		if (runOptions.Check)
			arguments.Append(" --check");
		if (runOptions.Diff)
			arguments.Append(" --diff");

		// PID line lets us interrupt the exact remote process on cancel; exec replaces the shell so $$ is ansible's PID.
		var script =
			$"cd {Quote(_options.WorkingDirectory)} && " +
			"echo \"__ANSIBLE_UI_PID__=$$\" && " +
			$"exec env ANSIBLE_FORCE_COLOR=True {arguments} 2>&1";

		using var client = Connect();
		using var command = client.CreateCommand($"sh -c {Quote(script)}");

		var asyncResult = command.BeginExecute();
		int? remotePid = null;

		await using var registration = ct.Register(() =>
		{
			if (remotePid is int pid)
				KillRemoteProcess(pid);
		});

		using var reader = new StreamReader(command.OutputStream, Encoding.UTF8);
		var chunk = new char[4096];
		var pending = new StringBuilder();
		while (true)
		{
			var read = await reader.ReadAsync(chunk.AsMemory(), CancellationToken.None);
			if (read == 0)
			{
				if (asyncResult.IsCompleted)
					break;
				await Task.Delay(50, CancellationToken.None);
				continue;
			}

			pending.Append(chunk, 0, read);
			var text = pending.ToString();
			pending.Clear();

			// Swallow the PID marker line; everything else is run output.
			if (remotePid is null && text.Contains("__ANSIBLE_UI_PID__="))
			{
				var lines = text.Split('\n').ToList();
				var markerIndex = lines.FindIndex(l => l.Contains("__ANSIBLE_UI_PID__="));
				remotePid = int.Parse(lines[markerIndex].Split('=')[1].Trim());
				lines.RemoveAt(markerIndex);
				text = string.Join('\n', lines);
			}

			if (text.Length > 0)
				await onOutput(text);
		}

		command.EndExecute(asyncResult);
		ct.ThrowIfCancellationRequested();

		if (remotePid is null && command.ExitStatus != 0)
			throw new InvalidOperationException("Preparation failed on the control node (git pull or shell), see run output");

		return command.ExitStatus ?? -1;
	}

	[GeneratedRegex("^[A-Za-z0-9._-]+$")]
	private static partial Regex SafeHostName();

	/// <summary>SIGINT lets ansible-playbook stop gracefully; SIGKILL after a grace period covers hung tasks.</summary>
	private void KillRemoteProcess(int pid)
	{
		try
		{
			using var client = Connect();
			client.RunCommand($"nohup sh -c 'kill -INT {pid} 2>/dev/null; sleep 10; kill -KILL {pid} 2>/dev/null' >/dev/null 2>&1 &");
		}
		catch (Exception e)
		{
			logger.LogError(e, "Failed to interrupt remote process {Pid}", pid);
		}
	}

	private async Task<(string Stdout, int ExitCode)> RunCommandAsync(string commandText, CancellationToken ct)
	{
		using var client = Connect();
		using var command = client.CreateCommand(commandText);
		var stdout = await Task.Factory.FromAsync(command.BeginExecute(), command.EndExecute).WaitAsync(ct);
		return (stdout, command.ExitStatus ?? -1);
	}

	private SshClient Connect()
	{
		if (!File.Exists(_options.PrivateKeyPath))
			throw new FileNotFoundException(
				$"Control node private key not found at '{_options.PrivateKeyPath}'. Set ControlNode:PrivateKeyPath to a valid key file.",
				_options.PrivateKeyPath);

		var key = string.IsNullOrEmpty(_options.PrivateKeyPassphrase)
			? new PrivateKeyFile(_options.PrivateKeyPath)
			: new PrivateKeyFile(_options.PrivateKeyPath, _options.PrivateKeyPassphrase);
		var client = new SshClient(_options.Host, _options.Port, _options.User, key);
		client.Connect();
		return client;
	}

	private static IReadOnlyList<string> ReadStringArray(JsonElement element, string property)
	{
		if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(property, out var array) || array.ValueKind != JsonValueKind.Array)
			return [];
		return [.. array.EnumerateArray().Select(e => e.GetString()!).Where(s => s is not null)];
	}

	private static string PosixParent(string path)
	{
		var trimmed = path.TrimEnd('/');
		var separator = trimmed.LastIndexOf('/');
		return separator < 0 ? "." : separator == 0 ? "/" : trimmed[..separator];
	}

	/// <summary>POSIX single-quote escaping.</summary>
	private static string Quote(string value)
	{
		return $"'{value.Replace("'", "'\\''")}'";
	}
}
