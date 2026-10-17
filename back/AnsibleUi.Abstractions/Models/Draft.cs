namespace AnsibleUi.Abstractions.Models;

/// <summary>
///     Brouillon: a set of changes to the Dépôt Ansible, edited in its own worktree on the Rebond,
///     committed to a dedicated branch and reviewed through a pull request.
/// </summary>
public sealed class Draft
{
	public Guid Id { get; init; } = Guid.CreateVersion7();

	public required string Title { get; init; }

	/// <summary>Dedicated branch (e.g. "ansible-ui/dev-user/fix-dns-1a2b3c4d").</summary>
	public required string Branch { get; init; }

	/// <summary>Révision distante the Brouillon started from.</summary>
	public required string BaseRevision { get; init; }

	/// <summary>Last commit pushed to <see cref="Branch" />; null until the first push.</summary>
	public string? HeadRevision { get; set; }

	public required string CreatedBy { get; init; }
	public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

	public DraftStatus Status { get; set; } = DraftStatus.Open;
	public DateTime? ClosedAt { get; set; }

	public int? PullRequestNumber { get; set; }
	public string? PullRequestUrl { get; set; }
}

public enum DraftStatus
{
	Open,
	Merged,
	Closed,
	Abandoned
}

/// <summary>Live Git state of an open Brouillon worktree.</summary>
/// <param name="HeadRevision">Local HEAD commit of the worktree.</param>
/// <param name="PushedRevision">Commit currently on the remote branch; null when never pushed.</param>
/// <param name="Ahead">Commits on the Brouillon not yet on the reference branch.</param>
/// <param name="Behind">Commits on the reference branch missing from the Brouillon.</param>
/// <param name="HasUncommittedChanges">Working tree differs from HEAD (autosaved, not committed).</param>
/// <param name="Changes">Every file differing from the merge base with the reference branch.</param>
public sealed record DraftWorkspaceStatus(
	string HeadRevision,
	string? PushedRevision,
	int Ahead,
	int Behind,
	bool HasUncommittedChanges,
	IReadOnlyList<DraftFileChange> Changes);

/// <param name="Path">Path relative to the Ansible directory.</param>
/// <param name="Kind">Added, Modified, Deleted or Renamed.</param>
/// <param name="PreviousPath">Source path of a rename.</param>
public sealed record DraftFileChange(string Path, DraftFileChangeKind Kind, string? PreviousPath);

public enum DraftFileChangeKind
{
	Added,
	Modified,
	Deleted,
	Renamed
}

/// <summary>Forge check state of one commit, as reported by its CI.</summary>
public sealed record CommitChecks(CommitCheckState State, string? TargetUrl);

public enum CommitCheckState
{
	None,
	Pending,
	Success,
	Failure
}

/// <param name="Number">Pull request index on the forge.</param>
/// <param name="Url">Browser URL of the pull request.</param>
/// <param name="State">Open, Merged or Closed.</param>
public sealed record PullRequest(int Number, string Url, PullRequestState State);

public enum PullRequestState
{
	Open,
	Merged,
	Closed
}

/// <summary>A Brouillon with its live worktree state and the forge checks of its pushed commit.</summary>
/// <param name="Workspace">Null once the Brouillon is closed and its worktree removed.</param>
/// <param name="Checks">Null when nothing was pushed yet or the forge is unreachable.</param>
public sealed record DraftDetail(Draft Draft, DraftWorkspaceStatus? Workspace, CommitChecks? Checks);
