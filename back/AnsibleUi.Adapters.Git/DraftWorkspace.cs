using AnsibleUi.Abstractions;
using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using Microsoft.Extensions.Options;

namespace AnsibleUi.Adapters.Git;

/// <summary>
///     Brouillon worktrees on the Rebond, all attached to one bare clone at "&lt;Root&gt;/repo.git":
///     "&lt;Root&gt;/drafts/&lt;id&gt;" per Brouillon and "&lt;Root&gt;/runs/&lt;id&gt;" per Run de brouillon.
///     Callers serialize operations; scripts only guard paths and Git state.
/// </summary>
public sealed class DraftWorkspace(
	IRemoteCommandExecutor commands,
	IOptions<GitRepositoryOptions> gitOptions,
	IOptions<DraftWorkspaceOptions> draftOptions) : IDraftWorkspace
{
	// Exit codes shared by the scripts below and mapped to HTTP errors in RunAsync.
	private const int NotFound = 3;
	private const int OutsideAnsibleDirectory = 4;
	private const int ChangedSinceRead = 6;
	private const int AlreadyExists = 7;
	private const int VaultFile = 8;
	private const int UncommittedChanges = 9;
	private const int RebaseConflict = 10;
	private const int NothingToPush = 11;
	private const int RemoteAhead = 12;

	private readonly GitRepositoryOptions _git = gitOptions.Value;
	private readonly DraftWorkspaceOptions _options = draftOptions.Value;

	private string Root => _options.Root.TrimEnd('/');
	private string Repository => $"{Root}/repo.git";
	private string Uploads => $"{Root}/uploads";
	private string ReferenceBranch => $"refs/remotes/origin/{_git.Branch}";
	private string Pathspec => RemoteFiles.Pathspec(_options.AnsibleDirectory);

	private string DraftDirectory(Guid draftId) => $"{Root}/drafts/{draftId:N}";
	private string RunDirectory(Guid runId) => $"{Root}/runs/{runId:N}";
	private static string RemoteBranch(string branch) => $"refs/remotes/origin/{branch}";

	public async Task<string> CreateAsync(Guid draftId, string branch, CancellationToken ct = default)
	{
		var script =
			$"{InitializeScript()} && git -C {Q(Repository)} fetch --quiet --prune origin || exit 1; " +
			$"git -C {Q(Repository)} worktree add --quiet --no-track -b {Q(branch)} {Q(DraftDirectory(draftId))} {Q(ReferenceBranch)} || exit 1; " +
			$"git -C {Q(DraftDirectory(draftId))} rev-parse HEAD";
		return (await RunAsync(script, "Could not create the Brouillon worktree", ct)).Trim();
	}

	public async Task RemoveAsync(Guid draftId, string branch, bool deleteRemoteBranch, CancellationToken ct = default)
	{
		var script =
			$"[ -d {Q(Repository)} ] || exit 0; " +
			$"git -C {Q(Repository)} worktree remove --force {Q(DraftDirectory(draftId))} 2>/dev/null || rm -rf -- {Q(DraftDirectory(draftId))}; " +
			$"git -C {Q(Repository)} worktree prune; " +
			$"git -C {Q(Repository)} branch -D {Q(branch)} >/dev/null 2>&1; " +
			(deleteRemoteBranch
				// The forge may already have deleted a merged branch; only an existing one must be deleted.
				? $"if git -C {Q(Repository)} ls-remote --exit-code origin {Q($"refs/heads/{branch}")} >/dev/null; then git -C {Q(Repository)} push --quiet origin --delete {Q(branch)} || exit 1; fi; "
				: "") +
			"exit 0";
		await RunAsync(script, "Could not remove the Brouillon worktree", ct);
	}

	public async Task FetchAsync(CancellationToken ct = default)
	{
		await RunAsync($"{InitializeScript()} && git -C {Q(Repository)} fetch --quiet --prune origin", "Could not fetch the Dépôt Ansible", ct);
	}

	public async Task<IReadOnlyList<string>> ListFilesAsync(Guid draftId, CancellationToken ct = default)
	{
		var output = await RunAsync(
			$"cd {Q(DraftDirectory(draftId))} || exit {NotFound}; " +
			$"git ls-files -z --cached --others --exclude-standard{Pathspec} || exit 1; printf '\\000:deleted:\\000'; " +
			$"git ls-files -z --deleted{Pathspec}",
			"Could not list Brouillon files", ct);
		var entries = RemoteFiles.SplitNul(output);
		var marker = Array.IndexOf(entries, ":deleted:");
		var deleted = entries[(marker + 1)..].ToHashSet(StringComparer.Ordinal);
		return entries[..marker]
			.Where(path => !deleted.Contains(path))
			.Select(path => RemoteFiles.ToAnsiblePath(path, _options.AnsibleDirectory))
			.OfType<string>()
			.Distinct(StringComparer.Ordinal)
			.Order(StringComparer.Ordinal)
			.ToList();
	}

	public async Task<RepositoryFile> ReadFileAsync(Guid draftId, string path, CancellationToken ct = default)
	{
		var output = await RunAsync(
			$"{GuardScript(draftId)} f={Q(RepositoryFilePath(path))}; inside \"$f\" || exit {OutsideAnsibleDirectory}; " +
			$"[ -f \"$f\" ] || exit {NotFound}; s=$(wc -c < \"$f\") || exit 1; echo \"$s\"; " +
			$"if [ \"$s\" -le {RemoteFiles.MaxSize} ]; then base64 -w0 < \"$f\"; fi",
			$"Could not read '{path}'", ct);
		return RemoteFiles.Parse(path, output);
	}

	public async Task<RepositoryFile?> ReadBaseFileAsync(Guid draftId, string path, CancellationToken ct = default)
	{
		var result = await commands.ExecuteAsync(
			$"cd {Q(DraftDirectory(draftId))} || exit 1; b=$(git merge-base HEAD {Q(ReferenceBranch)}) || exit 1; " +
			RemoteFiles.ReadBlobScript($"\"$b\":{Q(RepositoryFilePath(path))}"), ct);
		if (result.ExitCode == NotFound) return null;
		if (!result.Succeeded) throw HttpException.BadGateway($"Could not read the original '{path}': {Error(result)}");
		return RemoteFiles.Parse(path, result.StandardOutput);
	}

	public async Task<string> WriteFileAsync(Guid draftId, string path, string content, string? expectedHash, CancellationToken ct = default)
	{
		var bytes = RemoteFiles.Encode(content);
		if (expectedHash is not null && (expectedHash.Length != 64 || !expectedHash.All(char.IsAsciiHexDigitLower)))
			throw HttpException.BadRequest("Invalid file hash");

		// Content travels as base64 chunks into an upload file outside the worktree, then replaces
		// the target in one rename once every guard passed.
		var upload = $"{Uploads}/{Guid.NewGuid():N}";
		var encoded = Convert.ToBase64String(bytes);
		var first = true;
		for (var offset = 0; offset < encoded.Length || first; offset += RemoteFiles.ChunkSize)
		{
			var chunk = encoded.Substring(offset, Math.Min(RemoteFiles.ChunkSize, encoded.Length - offset));
			await RunAsync(
				$"mkdir -p {Q(Uploads)} && printf %s {Q(chunk)} {(first ? ">" : ">>")} {Q(upload)}",
				$"Could not upload '{path}'", ct);
			first = false;
		}

		var precondition = expectedHash is null
			? $"[ -e \"$f\" ] && exit {AlreadyExists}; "
			: $"[ -f \"$f\" ] || exit {NotFound}; isvault \"$f\" && exit {VaultFile}; " +
			  $"[ \"$(sha256sum < \"$f\" | cut -d' ' -f1)\" = {Q(expectedHash)} ] || exit {ChangedSinceRead}; ";
		var script =
			$"u={Q(upload)}; trap 'rm -f -- \"$u\" \"$u.bin\"' EXIT; " +
			$"{GuardScript(draftId)} f={Q(RepositoryFilePath(path))}; inside \"$f\" || exit {OutsideAnsibleDirectory}; " +
			$"[ -L \"$f\" ] && exit {OutsideAnsibleDirectory}; {precondition}" +
			"mkdir -p -- \"$(dirname -- \"$f\")\" || exit 1; " +
			$"base64 -d < \"$u\" > \"$u.bin\" || exit 1; [ -f \"$f\" ] && chmod --reference=\"$f\" \"$u.bin\"; " +
			"mv -f -- \"$u.bin\" \"$f\" || exit 1";
		await RunAsync(script, $"Could not write '{path}'", ct);
		return RemoteFiles.Hash(bytes);
	}

	public async Task DeleteFileAsync(Guid draftId, string path, CancellationToken ct = default)
	{
		await RunAsync(
			$"{GuardScript(draftId)} f={Q(RepositoryFilePath(path))}; inside \"$f\" || exit {OutsideAnsibleDirectory}; " +
			$"[ -L \"$f\" ] && exit {OutsideAnsibleDirectory}; [ -f \"$f\" ] || exit {NotFound}; isvault \"$f\" && exit {VaultFile}; " +
			"rm -f -- \"$f\"",
			$"Could not delete '{path}'", ct);
	}

	public async Task RenameFileAsync(Guid draftId, string path, string newPath, CancellationToken ct = default)
	{
		await RunAsync(
			$"{GuardScript(draftId)} f={Q(RepositoryFilePath(path))}; t={Q(RepositoryFilePath(newPath))}; " +
			$"inside \"$f\" && inside \"$t\" || exit {OutsideAnsibleDirectory}; [ -L \"$f\" ] && exit {OutsideAnsibleDirectory}; " +
			$"[ -f \"$f\" ] || exit {NotFound}; isvault \"$f\" && exit {VaultFile}; [ -e \"$t\" ] && exit {AlreadyExists}; " +
			"mkdir -p -- \"$(dirname -- \"$t\")\" && mv -- \"$f\" \"$t\"",
			$"Could not rename '{path}'", ct);
	}

	public async Task<DraftWorkspaceStatus> GetStatusAsync(Guid draftId, string branch, CancellationToken ct = default)
	{
		var output = await RunAsync(
			$"cd {Q(DraftDirectory(draftId))} || exit {NotFound}; " +
			"git rev-parse HEAD || exit 1; " +
			$"git rev-parse --verify -q {Q(RemoteBranch(branch))} || echo -; " +
			$"git rev-list --left-right --count {Q(ReferenceBranch + "...HEAD")} || exit 1; " +
			"git status --porcelain --untracked-files=all | wc -l; " +
			$"b=$(git merge-base HEAD {Q(ReferenceBranch)}) || exit 1; printf '\\000'; " +
			$"git diff -z --name-status -M \"$b\"{Pathspec} || exit 1; printf '\\000:untracked:\\000'; " +
			$"git ls-files -z --others --exclude-standard{Pathspec}",
			"Could not read the Brouillon status", ct);
		return ParseStatus(output, _options.AnsibleDirectory);
	}

	public async Task<string> CommitAndPushAsync(Guid draftId, string branch, string message, CommitAuthor author, CancellationToken ct = default)
	{
		var script =
			$"cd {Q(DraftDirectory(draftId))} || exit {NotFound}; " +
			$"git add -A{(Pathspec == "" ? " ." : Pathspec)} || exit 1; " +
			$"if ! git diff --cached --quiet; then {Committer()} commit --quiet --author={Q($"{Identity(author.Name)} <{Identity(author.Email)}>")} -m {Q(message)} || exit 1; fi; " +
			$"[ \"$(git rev-list --count {Q(ReferenceBranch + "..HEAD")})\" -gt 0 ] || exit {NothingToPush}; " +
			$"[ \"$(git rev-parse HEAD)\" = \"$(git rev-parse --verify -q {Q(RemoteBranch(branch))})\" ] && exit {NothingToPush}; " +
			$"git push --quiet origin {Q($"HEAD:refs/heads/{branch}")} || exit 1; " +
			"git rev-parse HEAD";
		return (await RunAsync(script, "Could not push the Brouillon", ct)).Trim();
	}

	public async Task<string> RebaseAsync(Guid draftId, string branch, CancellationToken ct = default)
	{
		// The lease protects against a concurrent push; the ancestry check refuses to drop commits
		// someone pushed to the branch outside Ansible UI.
		var script =
			$"cd {Q(DraftDirectory(draftId))} || exit {NotFound}; " +
			$"[ -z \"$(git status --porcelain --untracked-files=all)\" ] || exit {UncommittedChanges}; " +
			"git fetch --quiet --prune origin || exit 1; " +
			$"up=$(git rev-parse --verify -q {Q(RemoteBranch(branch))}); " +
			$"if [ -n \"$up\" ]; then git merge-base --is-ancestor \"$up\" HEAD || exit {RemoteAhead}; fi; " +
			$"if ! {Committer()} rebase --quiet {Q(ReferenceBranch)} >/dev/null 2>&1; then git rebase --abort >/dev/null 2>&1; exit {RebaseConflict}; fi; " +
			$"if [ -n \"$up\" ] && [ \"$(git rev-parse HEAD)\" != \"$up\" ]; then " +
			$"git push --quiet --force-with-lease={Q($"refs/heads/{branch}:")}\"$up\" origin {Q($"HEAD:refs/heads/{branch}")} || exit 1; fi; " +
			"git rev-parse HEAD";
		return (await RunAsync(script, "Could not update the Brouillon", ct)).Trim();
	}

	public async Task<IReadOnlyList<Playbook>> ListPlaybooksAsync(string revision, CancellationToken ct = default)
	{
		var playbooks = RemoteFiles.ToRepositoryPath("playbooks", _options.AnsibleDirectory);
		var output = await RunAsync(
			$"git -C {Q(Repository)} ls-tree -r -z --name-only {Q(RepositoryFiles.RequireRevision(revision))} -- {Q(playbooks)}",
			"Could not list Brouillon playbooks", ct);
		return RemoteFiles.SplitNul(output)
			.Select(path => RemoteFiles.ToAnsiblePath(path, _options.AnsibleDirectory))
			.OfType<string>()
			.Where(Playbook.IsPlaybookPath)
			.Order(StringComparer.Ordinal)
			.Select(Playbook.FromPath)
			.ToList();
	}

	public async Task<string> PrepareRunAsync(Guid runId, string revision, CancellationToken ct = default)
	{
		var commit = RepositoryFiles.RequireRevision(revision);
		var directory = RunDirectory(runId);
		await RunAsync(
			$"{InitializeScript()} || exit 1; " +
			$"git -C {Q(Repository)} cat-file -e {Q(commit + "^{commit}")} 2>/dev/null || git -C {Q(Repository)} fetch --quiet origin || exit 1; " +
			$"git -C {Q(Repository)} worktree remove --force {Q(directory)} 2>/dev/null; rm -rf -- {Q(directory)}; " +
			$"git -C {Q(Repository)} worktree add --quiet --detach {Q(directory)} {Q(commit)}",
			"Could not check out the Brouillon for this Run", ct);
		return WithAnsibleDirectory(directory);
	}

	public string AnsibleDirectoryOf(Guid draftId) => WithAnsibleDirectory(DraftDirectory(draftId));

	private string WithAnsibleDirectory(string worktree) =>
		_options.AnsibleDirectory == "" ? worktree : $"{worktree}/{_options.AnsibleDirectory}";

	public async Task CleanupRunAsync(Guid runId, CancellationToken ct = default)
	{
		await RunAsync(
			$"git -C {Q(Repository)} worktree remove --force {Q(RunDirectory(runId))} 2>/dev/null || rm -rf -- {Q(RunDirectory(runId))}; " +
			$"git -C {Q(Repository)} worktree prune",
			"Could not remove the Run worktree", ct);
	}

	public async Task CleanupRunsAsync(CancellationToken ct = default)
	{
		await RunAsync(
			$"[ -d {Q(Repository)} ] || exit 0; " +
			$"for d in {Q(Root + "/runs")}/*; do [ -d \"$d\" ] || continue; " +
			$"git -C {Q(Repository)} worktree remove --force \"$d\" 2>/dev/null || rm -rf -- \"$d\"; done; " +
			$"git -C {Q(Repository)} worktree prune; rm -f -- {Q(Uploads)}/*; exit 0",
			"Could not remove stale Run worktrees", ct);
	}

	internal static DraftWorkspaceStatus ParseStatus(string output, string ansibleDirectory)
	{
		var headerEnd = output.IndexOf('\0');
		var header = output[..headerEnd].Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
		var counts = header[2].Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
		var entries = RemoteFiles.SplitNul(output[(headerEnd + 1)..]);
		var marker = Array.IndexOf(entries, ":untracked:");

		var changes = new List<DraftFileChange>();
		for (var index = 0; index < marker; index++)
		{
			var code = entries[index];
			if (code.StartsWith('R') || code.StartsWith('C'))
			{
				var previous = RemoteFiles.ToAnsiblePath(entries[++index], ansibleDirectory);
				var renamed = RemoteFiles.ToAnsiblePath(entries[++index], ansibleDirectory);
				if (renamed is null) continue;
				changes.Add(code.StartsWith('R')
					? new DraftFileChange(renamed, DraftFileChangeKind.Renamed, previous)
					: new DraftFileChange(renamed, DraftFileChangeKind.Added, null));
				continue;
			}
			var path = RemoteFiles.ToAnsiblePath(entries[++index], ansibleDirectory);
			if (path is null) continue;
			changes.Add(new DraftFileChange(path, code switch
			{
				"A" => DraftFileChangeKind.Added,
				"D" => DraftFileChangeKind.Deleted,
				_ => DraftFileChangeKind.Modified
			}, null));
		}
		changes.AddRange(entries[(marker + 1)..]
			.Select(path => RemoteFiles.ToAnsiblePath(path, ansibleDirectory))
			.OfType<string>()
			.Select(path => new DraftFileChange(path, DraftFileChangeKind.Added, null)));

		return new DraftWorkspaceStatus(
			header[0],
			header[1] == "-" ? null : header[1],
			Ahead: int.Parse(counts[1]),
			Behind: int.Parse(counts[0]),
			HasUncommittedChanges: int.Parse(header[3]) > 0,
			changes.OrderBy(change => change.Path, StringComparer.Ordinal).ToList());
	}

	/// <summary>Creates the bare Brouillon clone on first use and keeps its origin aligned with configuration.</summary>
	private string InitializeScript() =>
		$"mkdir -p {Q(Root + "/drafts")} {Q(Root + "/runs")} {Q(Uploads)} && " +
		$"if [ ! -d {Q(Repository)} ]; then git clone --quiet --bare {Q(_git.Url)} {Q(Repository)} && " +
		$"git -C {Q(Repository)} config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*' || exit 1; fi && " +
		$"git -C {Q(Repository)} remote set-url origin {Q(_git.Url)}";

	/// <summary>
	///     Enters the Brouillon worktree and defines guards: "inside" resolves symlinks and accepts only
	///     paths below the Ansible directory; "isvault" detects encrypted Ansible Vault files.
	/// </summary>
	private string GuardScript(Guid draftId) =>
		$"cd {Q(DraftDirectory(draftId))} || exit {NotFound}; " +
		$"ROOT=$(realpath -m -- {Q(_options.AnsibleDirectory == "" ? "." : _options.AnsibleDirectory)}) || exit 1; " +
		"inside() { case \"$(realpath -m -- \"$1\")\" in \"$ROOT\"/*) return 0;; esac; return 1; }; " +
		$"isvault() {{ [ \"$(head -c {RemoteFiles.VaultHeader.Length} -- \"$1\")\" = {Q(RemoteFiles.VaultHeader)} ]; }};";

	private string RepositoryFilePath(string path) =>
		RemoteFiles.ToRepositoryPath(RepositoryPath.Validate(path), _options.AnsibleDirectory);

	private string Committer() =>
		$"git -c user.name={Q(Identity(_options.CommitterName))} -c user.email={Q(Identity(_options.CommitterEmail))}";

	/// <summary>Git identities cannot contain angle brackets or line breaks.</summary>
	private static string Identity(string value) =>
		new string(value.Where(character => character is not ('<' or '>') && !char.IsControl(character)).ToArray()).Trim();

	private static string Q(string value) => PosixShell.Quote(value);

	private async Task<string> RunAsync(string script, string failure, CancellationToken ct)
	{
		var result = await commands.ExecuteAsync(script, ct);
		if (result.Succeeded) return result.StandardOutput;
		throw result.ExitCode switch
		{
			NotFound => HttpException.NotFound($"{failure}: not found"),
			OutsideAnsibleDirectory => HttpException.BadRequest($"{failure}: the path leaves the Ansible directory"),
			ChangedSinceRead => HttpException.Conflict($"{failure}: the file changed since it was read"),
			AlreadyExists => HttpException.Conflict($"{failure}: a file already exists at that path"),
			VaultFile => HttpException.Conflict($"{failure}: Ansible Vault files are read-only in Ansible UI"),
			UncommittedChanges => HttpException.Conflict($"{failure}: commit or discard pending changes first"),
			RebaseConflict => HttpException.Conflict($"{failure}: the reference branch conflicts with this Brouillon; resolve it in the pull request"),
			NothingToPush => HttpException.Conflict($"{failure}: nothing new to push"),
			RemoteAhead => HttpException.Conflict($"{failure}: the branch has commits pushed outside Ansible UI"),
			_ => HttpException.BadGateway($"{failure}: {Error(result)}")
		};
	}

	private static string Error(RemoteCommandResult result)
	{
		var error = result.StandardError.Trim();
		return error.Length == 0 ? $"exit code {result.ExitCode}" : error[..Math.Min(error.Length, 500)];
	}
}
