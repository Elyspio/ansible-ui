using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Abstractions.Interfaces;

/// <summary>
///     Git worktrees of Brouillons on the Rebond. They live in a clone dedicated to Brouillons so the
///     authoritative clone used by the Synchronisation is never touched. Paths are relative to the
///     Ansible directory and must be validated with <see cref="RepositoryPath" /> first.
/// </summary>
public interface IDraftWorkspace
{
	/// <summary>Creates the worktree and its branch from the reference branch; returns the starting revision.</summary>
	Task<string> CreateAsync(Guid draftId, string branch, CancellationToken ct = default);

	Task RemoveAsync(Guid draftId, string branch, bool deleteRemoteBranch, CancellationToken ct = default);

	/// <summary>Fetches every branch so ahead/behind counts follow the reference branch.</summary>
	Task FetchAsync(CancellationToken ct = default);

	/// <summary>Absolute Ansible directory inside the Brouillon worktree on the Rebond.</summary>
	string AnsibleDirectoryOf(Guid draftId);

	Task<IReadOnlyList<string>> ListFilesAsync(Guid draftId, CancellationToken ct = default);
	Task<RepositoryFile> ReadFileAsync(Guid draftId, string path, CancellationToken ct = default);

	/// <summary>File at the merge base with the reference branch; null when the Brouillon added it.</summary>
	Task<RepositoryFile?> ReadBaseFileAsync(Guid draftId, string path, CancellationToken ct = default);

	/// <summary>Writes the file when its current hash still matches <paramref name="expectedHash" /> (null: must not exist).</summary>
	Task<string> WriteFileAsync(Guid draftId, string path, string content, string? expectedHash, CancellationToken ct = default);

	Task DeleteFileAsync(Guid draftId, string path, CancellationToken ct = default);
	Task RenameFileAsync(Guid draftId, string path, string newPath, CancellationToken ct = default);

	Task<DraftWorkspaceStatus> GetStatusAsync(Guid draftId, string branch, CancellationToken ct = default);

	/// <summary>Commits every change under the Ansible directory (if any) and pushes the branch; returns the pushed commit.</summary>
	Task<string> CommitAndPushAsync(Guid draftId, string branch, string message, CommitAuthor author, CancellationToken ct = default);

	/// <summary>Rebases the branch on the reference branch and force-pushes it with lease; returns the new HEAD.</summary>
	Task<string> RebaseAsync(Guid draftId, string branch, CancellationToken ct = default);

	Task<IReadOnlyList<Playbook>> ListPlaybooksAsync(string revision, CancellationToken ct = default);

	/// <summary>Checks out <paramref name="revision" /> in a detached worktree dedicated to one Run; returns its Ansible directory.</summary>
	Task<string> PrepareRunAsync(Guid runId, string revision, CancellationToken ct = default);

	Task CleanupRunAsync(Guid runId, CancellationToken ct = default);

	/// <summary>Removes Run worktrees left behind by a previous instance.</summary>
	Task CleanupRunsAsync(CancellationToken ct = default);
}

public sealed record CommitAuthor(string Name, string Email);
