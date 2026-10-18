using System.Globalization;
using System.Text;
using AnsibleUi.Abstractions;
using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using Microsoft.Extensions.Logging;

namespace AnsibleUi.Core.Services;

/// <summary>Who acts on a Brouillon: <paramref name="Login" /> names branches, the rest authors commits.</summary>
public sealed record DraftUser(string Login, string Name, string Email);

/// <summary>
///     Singleton owner of Brouillons. Every operation touching refs or the index of the shared Brouillon
///     clone goes through <see cref="_gitLock" />; file reads and writes only touch one worktree and stay
///     lock-free so autosave never waits behind a fetch or push.
/// </summary>
public sealed class DraftService(
	IDraftRepository drafts,
	IDraftWorkspace workspace,
	IForge forge,
	IRealtimeNotifier notifier,
	ILogger<DraftService> logger)
{
	private const int MaxTitleLength = 120;
	private const int MaxMessageLength = 4000;

	private readonly SemaphoreSlim _gitLock = new(1, 1);
	private string? _fetchedRemoteRevision;

	public Task<IReadOnlyList<Draft>> ListAsync(CancellationToken ct = default) => drafts.ListAsync(100, ct);

	public async Task<DraftDetail> GetAsync(Guid id, CancellationToken ct = default)
	{
		var draft = await RequireAsync(id, ct);
		if (draft.Status != DraftStatus.Open) return new DraftDetail(draft, null, null);

		var status = await LockedAsync(() => workspace.GetStatusAsync(draft.Id, draft.Branch, ct), ct);
		CommitChecks? checks = null;
		if (status.PushedRevision is not null)
		{
			try
			{
				checks = await forge.GetChecksAsync(status.PushedRevision, ct);
			}
			catch (Exception e) when (e is not OperationCanceledException)
			{
				logger.LogWarning(e, "Could not read forge checks of Brouillon {DraftId}", draft.Id);
			}
		}
		return new DraftDetail(draft, status, checks);
	}

	public async Task<Draft> CreateAsync(string title, DraftUser user, CancellationToken ct = default)
	{
		title = RequireText(title, MaxTitleLength, "A title is required");
		var id = Guid.CreateVersion7();
		var branch = $"ansible-ui/{Slug(user.Login, 24)}/{Slug(title, 40)}-{id.ToString("N")[^8..]}";
		var baseRevision = await LockedAsync(() => workspace.CreateAsync(id, branch, ct), ct);
		var draft = new Draft
		{
			Id = id,
			Title = title,
			Branch = branch,
			BaseRevision = baseRevision,
			CreatedBy = user.Name
		};
		await drafts.InsertAsync(draft, ct);
		await NotifyAsync(draft);
		return draft;
	}

	public async Task<IReadOnlyList<string>> ListFilesAsync(Guid id, CancellationToken ct = default) =>
		await workspace.ListFilesAsync((await RequireOpenAsync(id, ct)).Id, ct);

	public async Task<RepositoryFile> ReadFileAsync(Guid id, string path, CancellationToken ct = default) =>
		await workspace.ReadFileAsync((await RequireOpenAsync(id, ct)).Id, RepositoryPath.Validate(path), ct);

	public async Task<RepositoryFile?> ReadBaseFileAsync(Guid id, string path, CancellationToken ct = default) =>
		await workspace.ReadBaseFileAsync((await RequireOpenAsync(id, ct)).Id, RepositoryPath.Validate(path), ct);

	public async Task<string> WriteFileAsync(Guid id, string path, string content, string? expectedHash, CancellationToken ct = default) =>
		await workspace.WriteFileAsync((await RequireOpenAsync(id, ct)).Id, RepositoryPath.Validate(path), content, expectedHash, ct);

	public async Task DeleteFileAsync(Guid id, string path, CancellationToken ct = default) =>
		await workspace.DeleteFileAsync((await RequireOpenAsync(id, ct)).Id, RepositoryPath.Validate(path), ct);

	public async Task RenameFileAsync(Guid id, string path, string newPath, CancellationToken ct = default) =>
		await workspace.RenameFileAsync((await RequireOpenAsync(id, ct)).Id, RepositoryPath.Validate(path), RepositoryPath.Validate(newPath), ct);

	/// <summary>Commits pending changes, pushes the branch and opens the pull request on the first push.</summary>
	public async Task<Draft> CommitAsync(Guid id, string message, DraftUser user, CancellationToken ct = default)
	{
		message = RequireText(message, MaxMessageLength, "A commit message is required");
		var draft = await RequireOpenAsync(id, ct);
		await LockedAsync(async () =>
		{
			// A push that succeeded while opening the pull request failed leaves nothing to push:
			// skip straight to the pull request instead of failing forever.
			var status = await workspace.GetStatusAsync(draft.Id, draft.Branch, ct);
			var alreadyPushed = !status.HasUncommittedChanges && status.PushedRevision == status.HeadRevision;
			if (!alreadyPushed || draft.PullRequestNumber is not null)
				draft.HeadRevision = await workspace.CommitAndPushAsync(
					draft.Id, draft.Branch, message, new CommitAuthor(user.Name, user.Email), ct);
			else
				draft.HeadRevision = status.PushedRevision;
			draft.UpdatedAt = DateTime.UtcNow;
			await drafts.UpdateAsync(draft, ct);
			return 0;
		}, ct);

		if (draft.PullRequestNumber is null)
		{
			var pull = await forge.OpenPullRequestAsync(draft.Branch, draft.Title,
				$"Brouillon created in Ansible UI by {draft.CreatedBy}.", ct);
			draft.PullRequestNumber = pull.Number;
			draft.PullRequestUrl = pull.Url;
			await drafts.UpdateAsync(draft, ct);
		}
		await NotifyAsync(draft);
		return draft;
	}

	/// <summary>Rebases the Brouillon on the reference branch; a pushed branch is force-pushed with lease.</summary>
	public async Task<Draft> RebaseAsync(Guid id, CancellationToken ct = default)
	{
		var draft = await RequireOpenAsync(id, ct);
		await LockedAsync(async () =>
		{
			var head = await workspace.RebaseAsync(draft.Id, draft.Branch, ct);
			if (draft.HeadRevision is not null) draft.HeadRevision = head;
			draft.UpdatedAt = DateTime.UtcNow;
			await drafts.UpdateAsync(draft, ct);
			return 0;
		}, ct);
		await NotifyAsync(draft);
		return draft;
	}

	/// <summary>Closes the pull request, deletes the branch and the worktree; the record stays for history.</summary>
	public async Task<Draft> AbandonAsync(Guid id, CancellationToken ct = default)
	{
		// Under the lock end to end: the watcher must not see the pull request closed by this call
		// and archive the Brouillon as Closed in between.
		return await LockedAsync(async () =>
		{
			var draft = await RequireOpenAsync(id, ct);
			if (draft.PullRequestNumber is { } number) await forge.ClosePullRequestAsync(number, ct);
			await workspace.RemoveAsync(draft.Id, draft.Branch, deleteRemoteBranch: true, ct);
			await CloseAsync(draft, DraftStatus.Abandoned, ct);
			return draft;
		}, ct);
	}

	public async Task<IReadOnlyList<Playbook>> ListPlaybooksAsync(Guid id, CancellationToken ct = default)
	{
		var draft = await RequireOpenAsync(id, ct);
		if (draft.HeadRevision is null) return [];
		return await workspace.ListPlaybooksAsync(draft.HeadRevision, ct);
	}

	/// <summary>Freezes the pushed commit a Run de brouillon executes; refuses unpushed work.</summary>
	public async Task<DraftRunSource> CreateRunSourceAsync(Guid id, CancellationToken ct = default)
	{
		var draft = await RequireOpenAsync(id, ct);
		var status = await LockedAsync(() => workspace.GetStatusAsync(draft.Id, draft.Branch, ct), ct);
		if (status.HasUncommittedChanges || status.PushedRevision is null || status.PushedRevision != status.HeadRevision)
			throw HttpException.Conflict("Commit and push the Brouillon before running it");
		return new DraftRunSource(draft.Id, draft.Title, draft.Branch, status.PushedRevision, draft.PullRequestUrl);
	}

	public Task<string> PrepareRunAsync(Guid runId, DraftRunSource source, CancellationToken ct) =>
		LockedAsync(() => workspace.PrepareRunAsync(runId, source.Revision, ct), ct);

	public Task CleanupRunAsync(Guid runId) =>
		LockedAsync(async () =>
		{
			await workspace.CleanupRunAsync(runId, CancellationToken.None);
			return 0;
		}, CancellationToken.None);

	public Task CleanupRunsAsync(CancellationToken ct) =>
		LockedAsync(async () =>
		{
			await workspace.CleanupRunsAsync(ct);
			return 0;
		}, ct);

	/// <summary>
	///     One watch iteration: fetches when the Révision distante moved (behind counts change) and
	///     archives Brouillons whose pull request was merged or closed on the forge.
	/// </summary>
	public async Task ReconcileAsync(string? remoteRevision, CancellationToken ct)
	{
		var open = await drafts.ListOpenAsync(ct);
		if (open.Count == 0) return;

		if (remoteRevision is not null && remoteRevision != _fetchedRemoteRevision)
		{
			await LockedAsync(async () =>
			{
				await workspace.FetchAsync(ct);
				return 0;
			}, ct);
			_fetchedRemoteRevision = remoteRevision;
			foreach (var draft in open) await NotifyAsync(draft);
		}

		foreach (var draft in open)
		{
			if (draft.PullRequestNumber is not { } number) continue;
			try
			{
				await ArchiveIfPullRequestEndedAsync(draft, number, ct);
			}
			catch (Exception e) when (e is not OperationCanceledException)
			{
				logger.LogWarning(e, "Could not reconcile Brouillon {DraftId} with pull request #{Number}", draft.Id, number);
			}
		}
	}

	private async Task ArchiveIfPullRequestEndedAsync(Draft draft, int number, CancellationToken ct)
	{
		var pull = await forge.GetPullRequestAsync(number, ct);
		if (pull is null || pull.State == PullRequestState.Open) return;

		var merged = pull.State == PullRequestState.Merged;
		var archived = await LockedAsync(async () =>
		{
			// Abandoned meanwhile (it closes its own pull request): keep that status.
			if ((await drafts.GetAsync(draft.Id, ct))?.Status != DraftStatus.Open) return false;
			await workspace.RemoveAsync(draft.Id, draft.Branch, deleteRemoteBranch: merged, ct);
			await CloseAsync(draft, merged ? DraftStatus.Merged : DraftStatus.Closed, ct);
			return true;
		}, ct);
		if (!archived) return;
		logger.LogInformation("Brouillon {DraftId} archived: pull request #{Number} {State}", draft.Id, number, pull.State);
	}

	private async Task CloseAsync(Draft draft, DraftStatus status, CancellationToken ct)
	{
		draft.Status = status;
		draft.ClosedAt = draft.UpdatedAt = DateTime.UtcNow;
		await drafts.UpdateAsync(draft, ct);
		await NotifyAsync(draft);
	}

	private async Task<Draft> RequireAsync(Guid id, CancellationToken ct) =>
		await drafts.GetAsync(id, ct) ?? throw HttpException.NotFound($"Brouillon {id} not found");

	private async Task<Draft> RequireOpenAsync(Guid id, CancellationToken ct)
	{
		var draft = await RequireAsync(id, ct);
		return draft.Status == DraftStatus.Open
			? draft
			: throw HttpException.Conflict($"Brouillon {id} is {draft.Status}");
	}

	private async Task<T> LockedAsync<T>(Func<Task<T>> action, CancellationToken ct)
	{
		await _gitLock.WaitAsync(ct);
		try
		{
			return await action();
		}
		finally
		{
			_gitLock.Release();
		}
	}

	private async Task NotifyAsync(Draft draft)
	{
		try
		{
			await notifier.DraftChangedAsync(draft);
		}
		catch (Exception e)
		{
			logger.LogWarning(e, "Failed to publish Brouillon {DraftId}", draft.Id);
		}
	}

	private static string RequireText(string? value, int maxLength, string error)
	{
		var trimmed = value?.Trim() ?? "";
		if (trimmed.Length == 0) throw HttpException.BadRequest(error);
		if (trimmed.Length > maxLength) throw HttpException.BadRequest($"Limited to {maxLength} characters");
		return trimmed;
	}

	/// <summary>Lowercase ASCII branch segment: accents dropped, anything else collapsed to "-".</summary>
	internal static string Slug(string value, int maxLength)
	{
		var slug = new StringBuilder();
		foreach (var character in value.Normalize(NormalizationForm.FormD))
		{
			if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark) continue;
			if (char.IsAsciiLetterOrDigit(character)) slug.Append(char.ToLowerInvariant(character));
			else if (slug.Length > 0 && slug[^1] != '-') slug.Append('-');
		}
		var result = slug.ToString().Trim('-');
		if (result.Length > maxLength) result = result[..maxLength].TrimEnd('-');
		return result.Length == 0 ? "draft" : result;
	}
}
