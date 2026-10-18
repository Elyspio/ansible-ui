using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using AnsibleUi.Core.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Shouldly;
using Xunit;

namespace AnsibleUi.Core.Tests;

public sealed class DraftServiceTests
{
	private static readonly DraftUser User = new("dev", "Dev User", "dev@example.org");
	private static readonly string Head = new('1', 40);

	[Fact]
	public async Task Create_names_the_branch_after_user_and_title()
	{
		var (service, repository, _, _) = Create();

		var draft = await service.CreateAsync("  Réparer le DNS !  ", User, TestContext.Current.CancellationToken);

		draft.Title.ShouldBe("Réparer le DNS !");
		draft.Branch.ShouldStartWith("ansible-ui/dev/reparer-le-dns-", Case.Sensitive);
		draft.BaseRevision.ShouldBe("base");
		repository.Drafts.ShouldHaveSingleItem().ShouldBeSameAs(draft);
	}

	[Fact]
	public async Task First_commit_opens_the_pull_request_and_later_commits_reuse_it()
	{
		var (service, _, workspace, forge) = Create();
		var draft = await service.CreateAsync("Fix", User, TestContext.Current.CancellationToken);
		workspace.Status = Status(uncommitted: true, pushed: null);

		await service.CommitAsync(draft.Id, "first", User, TestContext.Current.CancellationToken);
		await service.CommitAsync(draft.Id, "second", User, TestContext.Current.CancellationToken);

		workspace.Pushes.ShouldBe(2);
		forge.Opened.ShouldBe(1);
		draft.PullRequestNumber.ShouldBe(7);
		draft.HeadRevision.ShouldBe(Head);
	}

	[Fact]
	public async Task Commit_after_a_failed_pull_request_skips_the_push_and_retries_the_pull_request()
	{
		var (service, _, workspace, forge) = Create();
		var draft = await service.CreateAsync("Fix", User, TestContext.Current.CancellationToken);
		forge.FailOpen = true;
		await Should.ThrowAsync<HttpException>(() => service.CommitAsync(draft.Id, "first", User, TestContext.Current.CancellationToken));
		forge.FailOpen = false;
		workspace.Status = Status(uncommitted: false, pushed: Head);

		await service.CommitAsync(draft.Id, "retry", User, TestContext.Current.CancellationToken);

		workspace.Pushes.ShouldBe(1);
		draft.PullRequestNumber.ShouldBe(7);
	}

	[Fact]
	public async Task Run_de_brouillon_requires_the_pushed_commit()
	{
		var (service, _, workspace, _) = Create();
		var draft = await service.CreateAsync("Fix", User, TestContext.Current.CancellationToken);
		workspace.Status = Status(uncommitted: true, pushed: Head);

		var error = await Should.ThrowAsync<HttpException>(() => service.CreateRunSourceAsync(draft.Id, TestContext.Current.CancellationToken));
		error.StatusCode.ShouldBe(409);

		workspace.Status = Status(uncommitted: false, pushed: Head);
		var source = await service.CreateRunSourceAsync(draft.Id, TestContext.Current.CancellationToken);
		source.Revision.ShouldBe(Head);
		source.Branch.ShouldBe(draft.Branch);
	}

	[Fact]
	public async Task Merged_pull_request_archives_the_draft_and_deletes_its_branch()
	{
		var (service, _, workspace, forge) = Create();
		var merged = await service.CreateAsync("Merged", User, TestContext.Current.CancellationToken);
		var closed = await service.CreateAsync("Closed", User, TestContext.Current.CancellationToken);
		merged.PullRequestNumber = 1;
		closed.PullRequestNumber = 2;
		forge.States[1] = PullRequestState.Merged;
		forge.States[2] = PullRequestState.Closed;

		await service.ReconcileAsync(null, TestContext.Current.CancellationToken);

		merged.Status.ShouldBe(DraftStatus.Merged);
		closed.Status.ShouldBe(DraftStatus.Closed);
		workspace.Removed.ShouldBe([(merged.Id, true), (closed.Id, false)]);
	}

	[Fact]
	public async Task Abandon_keeps_its_status_when_the_watcher_sees_the_pull_request_it_closed()
	{
		var (service, _, workspace, forge) = Create();
		var draft = await service.CreateAsync("Abandoned", User, TestContext.Current.CancellationToken);
		draft.PullRequestNumber = 3;
		Task? reconcile = null;
		forge.OnClose = number =>
		{
			forge.States[number] = PullRequestState.Closed;
			reconcile = service.ReconcileAsync(null, TestContext.Current.CancellationToken);
		};

		await service.AbandonAsync(draft.Id, TestContext.Current.CancellationToken);
		await reconcile.ShouldNotBeNull();

		draft.Status.ShouldBe(DraftStatus.Abandoned);
		workspace.Removed.ShouldBe([(draft.Id, true)]);
	}

	[Fact]
	public async Task Reconcile_fetches_once_per_new_remote_revision()
	{
		var (service, _, workspace, _) = Create();
		await service.CreateAsync("Fix", User, TestContext.Current.CancellationToken);

		await service.ReconcileAsync("r1", TestContext.Current.CancellationToken);
		await service.ReconcileAsync("r1", TestContext.Current.CancellationToken);
		await service.ReconcileAsync("r2", TestContext.Current.CancellationToken);

		workspace.Fetches.ShouldBe(2);
	}

	[Fact]
	public async Task Inventory_validation_runs_in_the_draft_worktree_and_only_while_open()
	{
		var (service, _, _, _) = Create();
		var draft = await service.CreateAsync("Add host", User, TestContext.Current.CancellationToken);

		var validation = await service.ValidateInventoryAsync(draft.Id, TestContext.Current.CancellationToken);
		await service.AbandonAsync(draft.Id, TestContext.Current.CancellationToken);

		validation.Hosts.ShouldBe([$"/drafts/{draft.Id:N}/ansible"]);
		(await Should.ThrowAsync<HttpException>(() =>
			service.ValidateInventoryAsync(draft.Id, TestContext.Current.CancellationToken))).StatusCode.ShouldBe(409);
	}

	[Fact]
	public async Task Closed_drafts_refuse_edits()
	{
		var (service, _, _, _) = Create();
		var draft = await service.CreateAsync("Fix", User, TestContext.Current.CancellationToken);
		await service.AbandonAsync(draft.Id, TestContext.Current.CancellationToken);

		var error = await Should.ThrowAsync<HttpException>(() =>
			service.WriteFileAsync(draft.Id, "site.yml", "", null, TestContext.Current.CancellationToken));

		error.StatusCode.ShouldBe(409);
		draft.Status.ShouldBe(DraftStatus.Abandoned);
	}

	[Theory]
	[InlineData("Fix DNS", "fix-dns")]
	[InlineData("  --Été 2026: ¡nouveau!--  ", "ete-2026-nouveau")]
	[InlineData("日本", "draft")]
	public void Slug_keeps_branch_names_ascii(string value, string expected)
	{
		DraftService.Slug(value, 40).ShouldBe(expected);
	}

	private static DraftWorkspaceStatus Status(bool uncommitted, string? pushed) =>
		new(Head, pushed, 1, 0, uncommitted, []);

	private static (DraftService, FakeDraftRepository, FakeWorkspace, FakeForge) Create()
	{
		var repository = new FakeDraftRepository();
		var workspace = new FakeWorkspace();
		var forge = new FakeForge();
		return (new DraftService(repository, workspace, forge, new FakeAnsible(), new NullNotifier(), NullLogger<DraftService>.Instance),
			repository, workspace, forge);
	}

	private sealed class FakeDraftRepository : IDraftRepository
	{
		public List<Draft> Drafts { get; } = [];
		public Task InsertAsync(Draft draft, CancellationToken ct = default)
		{
			Drafts.Add(draft);
			return Task.CompletedTask;
		}
		public Task<Draft?> GetAsync(Guid id, CancellationToken ct = default) => Task.FromResult(Drafts.FirstOrDefault(d => d.Id == id));
		public Task<IReadOnlyList<Draft>> ListAsync(int take, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Draft>>(Drafts);
		public Task<IReadOnlyList<Draft>> ListOpenAsync(CancellationToken ct = default) =>
			Task.FromResult<IReadOnlyList<Draft>>(Drafts.Where(d => d.Status == DraftStatus.Open).ToList());
		public Task UpdateAsync(Draft draft, CancellationToken ct = default) => Task.CompletedTask;
	}

	private sealed class FakeWorkspace : IDraftWorkspace
	{
		public DraftWorkspaceStatus Status { get; set; } = new(Head, null, 0, 0, true, []);
		public int Pushes { get; private set; }
		public int Fetches { get; private set; }
		public List<(Guid, bool)> Removed { get; } = [];

		public Task<string> CreateAsync(Guid draftId, string branch, CancellationToken ct = default) => Task.FromResult("base");
		public string AnsibleDirectoryOf(Guid draftId) => $"/drafts/{draftId:N}/ansible";
		public Task RemoveAsync(Guid draftId, string branch, bool deleteRemoteBranch, CancellationToken ct = default)
		{
			Removed.Add((draftId, deleteRemoteBranch));
			return Task.CompletedTask;
		}
		public Task FetchAsync(CancellationToken ct = default)
		{
			Fetches++;
			return Task.CompletedTask;
		}
		public Task<IReadOnlyList<string>> ListFilesAsync(Guid draftId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<string>>([]);
		public Task<RepositoryFile> ReadFileAsync(Guid draftId, string path, CancellationToken ct = default) => throw new NotSupportedException();
		public Task<RepositoryFile?> ReadBaseFileAsync(Guid draftId, string path, CancellationToken ct = default) => throw new NotSupportedException();
		public Task<string> WriteFileAsync(Guid draftId, string path, string content, string? expectedHash, CancellationToken ct = default) => Task.FromResult("hash");
		public Task DeleteFileAsync(Guid draftId, string path, CancellationToken ct = default) => Task.CompletedTask;
		public Task RenameFileAsync(Guid draftId, string path, string newPath, CancellationToken ct = default) => Task.CompletedTask;
		public Task<DraftWorkspaceStatus> GetStatusAsync(Guid draftId, string branch, CancellationToken ct = default) => Task.FromResult(Status);
		public Task<string> CommitAndPushAsync(Guid draftId, string branch, string message, CommitAuthor author, CancellationToken ct = default)
		{
			Pushes++;
			return Task.FromResult(Head);
		}
		public Task<string> RebaseAsync(Guid draftId, string branch, CancellationToken ct = default) => Task.FromResult(Head);
		public Task<IReadOnlyList<Playbook>> ListPlaybooksAsync(string revision, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Playbook>>([]);
		public Task<string> PrepareRunAsync(Guid runId, string revision, CancellationToken ct = default) => Task.FromResult("/runs");
		public Task CleanupRunAsync(Guid runId, CancellationToken ct = default) => Task.CompletedTask;
		public Task CleanupRunsAsync(CancellationToken ct = default) => Task.CompletedTask;
	}

	private sealed class FakeForge : IForge
	{
		public int Opened { get; private set; }
		public bool FailOpen { get; set; }
		public Dictionary<int, PullRequestState> States { get; } = [];

		public Task<PullRequest> OpenPullRequestAsync(string branch, string title, string body, CancellationToken ct = default)
		{
			if (FailOpen) throw HttpException.BadGateway("forge down");
			Opened++;
			return Task.FromResult(new PullRequest(7, "https://git.example/pulls/7", PullRequestState.Open));
		}
		public Task<PullRequest?> GetPullRequestAsync(int number, CancellationToken ct = default) =>
			Task.FromResult<PullRequest?>(new PullRequest(number, "u", States.GetValueOrDefault(number, PullRequestState.Open)));
		public Action<int>? OnClose { get; set; }

		public Task ClosePullRequestAsync(int number, CancellationToken ct = default)
		{
			OnClose?.Invoke(number);
			return Task.CompletedTask;
		}
		public Task<CommitChecks> GetChecksAsync(string revision, CancellationToken ct = default) =>
			Task.FromResult(new CommitChecks(CommitCheckState.None, null));
	}

	private sealed class FakeAnsible : IAnsibleRebond
	{
		public Task<IReadOnlyList<Playbook>> ListPlaybooksAsync(CancellationToken ct = default) => throw new NotSupportedException();
		public Task<Inventory> GetInventoryAsync(CancellationToken ct = default) => throw new NotSupportedException();
		public Task<InventoryValidation> ValidateInventoryAsync(string workingDirectory, CancellationToken ct = default) =>
			Task.FromResult(new InventoryValidation(true, null, [], [workingDirectory]));
		public Task<IReadOnlyList<InventoryHostFacts>> GetInventoryHostFactsAsync(CancellationToken ct = default) => throw new NotSupportedException();
		public Task<string?> GetHostVarsAsync(string host, CancellationToken ct = default) => throw new NotSupportedException();
		public Task<int> ExecutePlaybookAsync(string playbook, RunOptions options, string? workingDirectory, Func<string, Task> onOutput, CancellationToken ct) =>
			throw new NotSupportedException();
	}

	private sealed class NullNotifier : IRealtimeNotifier
	{
		public Task RunOutputAsync(Guid runId, string chunk) => Task.CompletedTask;
		public Task RunChangedAsync(Run run) => Task.CompletedTask;
		public Task RepositoryChangedAsync(RepositoryStatus status) => Task.CompletedTask;
		public Task RepositoryStatusChangedAsync(RepositoryStatus status) => Task.CompletedTask;
		public Task DraftChangedAsync(Draft draft) => Task.CompletedTask;
	}
}
