using AnsibleUi.Abstractions;
using AnsibleUi.Abstractions.Interfaces;
using Microsoft.Extensions.Options;

namespace AnsibleUi.Adapters.Git;

public sealed class GitRepository(
	IRemoteCommandExecutor commands,
	IOptions<GitRepositoryOptions> options) : IGitRepository
{
	private readonly GitRepositoryOptions _options = options.Value;

	public async Task<string> GetRemoteRevisionAsync(CancellationToken ct = default)
	{
		var reference = $"refs/heads/{_options.Branch}";
		var result = await commands.ExecuteAsync(
			$"git ls-remote --exit-code {PosixShell.Quote(_options.Url)} {PosixShell.Quote(reference)}", ct);
		RequireSuccess(result, $"Remote branch '{_options.Branch}' is unavailable");
		return result.StandardOutput.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()
			?? throw new InvalidOperationException("Git server returned no revision");
	}

	public async Task SynchronizeAsync(CancellationToken ct = default)
	{
		var repository = PosixShell.Quote(_options.Path);
		var parent = PosixShell.Quote(PosixShell.Parent(_options.Path));
		var url = PosixShell.Quote(_options.Url);
		var branch = PosixShell.Quote(_options.Branch);
		var script =
			$"mkdir -p {parent} && " +
			$"if [ -d {repository}/.git ]; then " +
			$"cd {repository} && git remote set-url origin {url} && " +
			$"git fetch --prune origin {branch} && " +
			$"git checkout -B {branch} origin/{branch} && git reset --hard origin/{branch}; " +
			$"elif [ -d {repository} ] && [ -z \"$(ls -A {repository})\" ]; then " +
			$"git clone --single-branch --branch {branch} {url} {repository}; " +
			$"elif [ -e {repository} ]; then echo 'Repository path exists but is not a Git clone' >&2; exit 1; " +
			$"else git clone --single-branch --branch {branch} {url} {repository}; fi";

		RequireSuccess(await commands.ExecuteAsync(script, ct), "Failed to clone or reset the Ansible repository");
	}

	public async Task<string> GetLocalRevisionAsync(CancellationToken ct = default)
	{
		var result = await commands.ExecuteAsync($"git -C {PosixShell.Quote(_options.Path)} rev-parse HEAD", ct);
		RequireSuccess(result, "The Ansible repository clone has no HEAD");
		return result.StandardOutput.Trim();
	}

	public async Task<bool> HasTrackedChangesAsync(CancellationToken ct = default)
	{
		var result = await commands.ExecuteAsync(
			$"git -C {PosixShell.Quote(_options.Path)} status --porcelain --untracked-files=no", ct);
		RequireSuccess(result, "Could not inspect the Ansible repository working tree");
		return !string.IsNullOrWhiteSpace(result.StandardOutput);
	}

	public async Task<bool> HasExpectedConfigurationAsync(CancellationToken ct = default)
	{
		var result = await commands.ExecuteAsync(
			$"git -C {PosixShell.Quote(_options.Path)} remote get-url origin && " +
			$"git -C {PosixShell.Quote(_options.Path)} symbolic-ref --short HEAD", ct);
		if (!result.Succeeded) return false;
		var lines = result.StandardOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
		return lines.Length == 2 && lines[0] == _options.Url && lines[1] == _options.Branch;
	}

	private static void RequireSuccess(AnsibleUi.Abstractions.Models.RemoteCommandResult result, string message)
	{
		if (!result.Succeeded) throw new InvalidOperationException($"{message}: {result.StandardError.Trim()}");
	}
}
