using AnsibleUi.Abstractions;
using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using Microsoft.Extensions.Options;

namespace AnsibleUi.Adapters.Git;

/// <summary>
///     Reads published files from Git objects of the authoritative clone. Never touches its working
///     tree or index, so it neither waits behind a running Playbook nor disturbs the Synchronisation.
/// </summary>
public sealed class RepositoryFiles(
	IRemoteCommandExecutor commands,
	IOptions<GitRepositoryOptions> gitOptions,
	IOptions<DraftWorkspaceOptions> draftOptions) : IRepositoryFiles
{
	private readonly string _repository = gitOptions.Value.Path;
	private readonly string _ansibleDirectory = draftOptions.Value.AnsibleDirectory;

	public async Task<IReadOnlyList<string>> ListFilesAsync(string revision, CancellationToken ct = default)
	{
		var result = await commands.ExecuteAsync(
			$"git -C {PosixShell.Quote(_repository)} ls-tree -r -z --name-only {PosixShell.Quote(RequireRevision(revision))}{RemoteFiles.Pathspec(_ansibleDirectory)}", ct);
		if (!result.Succeeded)
			throw HttpException.BadGateway($"Could not list repository files: {result.StandardError.Trim()}");
		return RemoteFiles.SplitNul(result.StandardOutput)
			.Select(path => RemoteFiles.ToAnsiblePath(path, _ansibleDirectory))
			.OfType<string>()
			.Order(StringComparer.Ordinal)
			.ToList();
	}

	public async Task<RepositoryFile> ReadFileAsync(string revision, string path, CancellationToken ct = default)
	{
		var objectName = $"{RequireRevision(revision)}:{RemoteFiles.ToRepositoryPath(RepositoryPath.Validate(path), _ansibleDirectory)}";
		var result = await commands.ExecuteAsync(
			$"cd {PosixShell.Quote(_repository)} || exit 1; {RemoteFiles.ReadBlobScript(PosixShell.Quote(objectName))}", ct);
		if (result.ExitCode == 3) throw HttpException.NotFound($"File '{path}' not found");
		if (!result.Succeeded)
			throw HttpException.BadGateway($"Could not read '{path}': {result.StandardError.Trim()}");
		return RemoteFiles.Parse(path, result.StandardOutput);
	}

	/// <summary>Revisions come from the published snapshot; still refuse anything that is not a full object name.</summary>
	internal static string RequireRevision(string revision) =>
		revision.Length is 40 or 64 && revision.All(char.IsAsciiHexDigitLower)
			? revision
			: throw HttpException.BadRequest($"Invalid revision '{revision}'");
}
