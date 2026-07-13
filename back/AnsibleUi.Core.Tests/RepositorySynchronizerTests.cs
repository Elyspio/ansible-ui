using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using AnsibleUi.Core.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace AnsibleUi.Core.Tests;

public sealed class RepositorySynchronizerTests
{
	[Fact]
	public async Task Repository_synchronizer_exposes_published_snapshot_through_its_interface()
	{
		var ct = TestContext.Current.CancellationToken;
		var gitRepository = new FakeGitRepository();
		IRepositorySynchronizer synchronizer = CreateSynchronizer(gitRepository, new FakeAnsibleRebond());

		var status = await synchronizer.SynchronizeAsync(ct);
		var snapshot = await synchronizer.GetSnapshotAsync(ct);

		Assert.False(status.IsDegraded);
		Assert.Equal("abc123", status.Revision);
		Assert.Equal(status.Revision, snapshot.Revision);
		Assert.Single(snapshot.Playbooks);
		Assert.Equal(["host-1"], snapshot.Inventory.Hosts.Select(host => host.Name));
	}

	[Fact]
	public async Task Initial_snapshot_is_shared_by_parallel_callers()
	{
		var ct = TestContext.Current.CancellationToken;
		var gitRepository = new FakeGitRepository();
		var ansibleRebond = new FakeAnsibleRebond();
		var synchronizer = new RepositorySynchronizer(
			gitRepository,
			ansibleRebond,
			new FakeNotifier(),
			NullLogger<RepositorySynchronizer>.Instance);

		var snapshots = await Task.WhenAll(
			Enumerable.Range(0, 8).Select(_ => synchronizer.GetSnapshotAsync(ct)));

		Assert.Equal(1, gitRepository.RemoteRevisionCalls);
		Assert.Equal(1, gitRepository.SynchronizeCalls);
		Assert.All(snapshots, snapshot => Assert.Equal("abc123", snapshot.Revision));
	}

	[Fact]
	public async Task Failed_probe_keeps_last_snapshot_and_marks_status_degraded()
	{
		var ct = TestContext.Current.CancellationToken;
		var gitRepository = new FakeGitRepository();
		var synchronizer = CreateSynchronizer(gitRepository, new FakeAnsibleRebond());
		var initial = await synchronizer.GetSnapshotAsync(ct);
		gitRepository.RemoteRevisionError = new IOException("Forge unavailable");

		var status = await synchronizer.SynchronizeAsync(ct);
		var stale = await synchronizer.GetSnapshotAsync(ct);

		Assert.Same(initial, stale);
		Assert.True(status.IsDegraded);
		Assert.Equal("Forge unavailable", status.Error);
	}

	[Fact]
	public async Task Probe_waits_until_running_playbook_releases_repository()
	{
		var ct = TestContext.Current.CancellationToken;
		var gitRepository = new FakeGitRepository();
		var ansibleRebond = new FakeAnsibleRebond();
		var synchronizer = CreateSynchronizer(gitRepository, ansibleRebond);
		await synchronizer.GetSnapshotAsync(ct);
		ansibleRebond.ExecuteStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
		ansibleRebond.FinishExecute = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

		var run = synchronizer.ExecutePlaybookAsync("playbooks/site.yml", new RunOptions(), _ => Task.CompletedTask, ct);
		await ansibleRebond.ExecuteStarted.Task;
		gitRepository.RemoteRevision = "def456";
		var probe = synchronizer.SynchronizeAsync(ct);
		await Task.Delay(30, ct);

		Assert.Equal(1, gitRepository.SynchronizeCalls);
		Assert.False(probe.IsCompleted);
		ansibleRebond.FinishExecute.SetResult();
		await Task.WhenAll(run, probe);
		Assert.Equal(2, gitRepository.SynchronizeCalls);
	}

	[Fact]
	public async Task Run_resets_tracked_changes_even_when_remote_revision_is_unchanged()
	{
		var ct = TestContext.Current.CancellationToken;
		var gitRepository = new FakeGitRepository();
		var synchronizer = CreateSynchronizer(gitRepository, new FakeAnsibleRebond());
		await synchronizer.GetSnapshotAsync(ct);
		gitRepository.HasTrackedChanges = true;

		await synchronizer.ExecutePlaybookAsync(
			"playbooks/site.yml", new RunOptions(), _ => Task.CompletedTask, ct);

		Assert.Equal(2, gitRepository.SynchronizeCalls);
	}

	[Fact]
	public async Task Unchanged_probe_publishes_status_without_repository_changed_event()
	{
		var ct = TestContext.Current.CancellationToken;
		var gitRepository = new FakeGitRepository();
		var notifier = new FakeNotifier();
		var synchronizer = new RepositorySynchronizer(
			gitRepository, new FakeAnsibleRebond(), notifier, NullLogger<RepositorySynchronizer>.Instance);
		await synchronizer.GetSnapshotAsync(ct);
		var changedEvents = notifier.RepositoryChangedCalls;

		await synchronizer.SynchronizeAsync(ct);

		Assert.Equal(changedEvents, notifier.RepositoryChangedCalls);
		Assert.True(notifier.RepositoryStatusChangedCalls > 0);
	}

	[Fact]
	public async Task Run_reconciles_wrong_origin_or_branch_even_when_revision_is_unchanged()
	{
		var ct = TestContext.Current.CancellationToken;
		var gitRepository = new FakeGitRepository();
		var synchronizer = CreateSynchronizer(gitRepository, new FakeAnsibleRebond());
		await synchronizer.GetSnapshotAsync(ct);
		gitRepository.HasExpectedRepositoryConfiguration = false;

		await synchronizer.ExecutePlaybookAsync(
			"playbooks/site.yml", new RunOptions(), _ => Task.CompletedTask, ct);

		Assert.Equal(2, gitRepository.SynchronizeCalls);
	}

	[Fact]
	public async Task Inventory_facts_merge_probed_values_and_flag_missing_hosts()
	{
		var ct = TestContext.Current.CancellationToken;
		var ansibleRebond = new FakeAnsibleRebond
		{
			Inventory = new Inventory(
				[new InventoryGroup("web", ["host-1", "host-2"], [])],
				[
					new InventoryHost("host-1", null, null, null, [], "unknown", null, null, null),
					new InventoryHost("host-2", null, null, null, [], "unknown", null, null, null),
				]),
			HostFacts = [new InventoryHostFacts("host-1", "reachable", "10.0.0.1", "Debian", "Debian", null, TimeSpan.FromHours(2))],
		};
		var synchronizer = CreateSynchronizer(new FakeGitRepository(), ansibleRebond);

		var inventory = await synchronizer.GetInventoryAsync(ct);

		var probed = Assert.Single(inventory.Hosts, host => host.Name == "host-1");
		Assert.Equal("reachable", probed.Status);
		Assert.Equal("10.0.0.1", probed.Ip);
		Assert.Equal(TimeSpan.FromHours(2), probed.Uptime);
		Assert.Equal(["web"], probed.Groups);
		Assert.NotNull(probed.LastChecked);
		var missing = Assert.Single(inventory.Hosts, host => host.Name == "host-2");
		Assert.Equal("unknown", missing.Status);
		Assert.Equal("Fact probe returned no result for this host.", missing.Error);
		Assert.NotNull(missing.LastChecked);
	}

	[Fact]
	public async Task Inventory_facts_are_cached_between_calls()
	{
		var ct = TestContext.Current.CancellationToken;
		var ansibleRebond = new FakeAnsibleRebond();
		var synchronizer = CreateSynchronizer(new FakeGitRepository(), ansibleRebond);

		await synchronizer.GetInventoryAsync(ct);
		await synchronizer.GetInventoryAsync(ct);

		Assert.Equal(1, ansibleRebond.FactsCalls);
	}

	[Fact]
	public async Task Snapshot_refresh_invalidates_the_facts_cache()
	{
		var ct = TestContext.Current.CancellationToken;
		var gitRepository = new FakeGitRepository();
		var ansibleRebond = new FakeAnsibleRebond();
		var synchronizer = CreateSynchronizer(gitRepository, ansibleRebond);
		await synchronizer.GetInventoryAsync(ct);

		gitRepository.RemoteRevision = "def456";
		await synchronizer.SynchronizeAsync(ct);
		await synchronizer.GetInventoryAsync(ct);

		Assert.Equal(2, ansibleRebond.FactsCalls);
	}

	[Fact]
	public async Task Inventory_stays_available_while_a_playbook_holds_the_repository()
	{
		var ct = TestContext.Current.CancellationToken;
		var ansibleRebond = new FakeAnsibleRebond();
		var synchronizer = CreateSynchronizer(new FakeGitRepository(), ansibleRebond);
		await synchronizer.GetSnapshotAsync(ct);
		ansibleRebond.ExecuteStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
		ansibleRebond.FinishExecute = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
		var run = synchronizer.ExecutePlaybookAsync("playbooks/site.yml", new RunOptions(), _ => Task.CompletedTask, ct);
		await ansibleRebond.ExecuteStarted.Task;

		// Degrades to the structure-only inventory instead of queueing behind the run.
		var inventory = await synchronizer.GetInventoryAsync(ct);

		Assert.Equal(0, ansibleRebond.FactsCalls);
		Assert.All(inventory.Hosts, host => Assert.Equal("unknown", host.Status));
		ansibleRebond.FinishExecute.SetResult();
		await run;
	}

	private static RepositorySynchronizer CreateSynchronizer(FakeGitRepository gitRepository, FakeAnsibleRebond ansibleRebond) => new(
		gitRepository,
		ansibleRebond,
		new FakeNotifier(),
		NullLogger<RepositorySynchronizer>.Instance);

	private sealed class FakeGitRepository : IGitRepository
	{
		public int RemoteRevisionCalls { get; private set; }
		public int SynchronizeCalls { get; private set; }
		public string RemoteRevision { get; set; } = "abc123";
		public Exception? RemoteRevisionError { get; set; }
		public TaskCompletionSource? ExecuteStarted { get; set; }
		public TaskCompletionSource? FinishExecute { get; set; }

		public async Task<string> GetRemoteRevisionAsync(CancellationToken ct = default)
		{
			RemoteRevisionCalls++;
			await Task.Delay(20, ct);
			if (RemoteRevisionError is not null) throw RemoteRevisionError;
			return RemoteRevision;
		}

		public Task SynchronizeAsync(CancellationToken ct = default)
		{
			SynchronizeCalls++;
			return Task.CompletedTask;
		}

		public Task<string> GetLocalRevisionAsync(CancellationToken ct = default) => Task.FromResult(RemoteRevision);
		public bool HasTrackedChanges { get; set; }
		public Task<bool> HasTrackedChangesAsync(CancellationToken ct = default) => Task.FromResult(HasTrackedChanges);
		public bool HasExpectedRepositoryConfiguration { get; set; } = true;
		public Task<bool> HasExpectedConfigurationAsync(CancellationToken ct = default) =>
			Task.FromResult(HasExpectedRepositoryConfiguration);
	}

	private sealed class FakeAnsibleRebond : IAnsibleRebond
	{
		public TaskCompletionSource? ExecuteStarted { get; set; }
		public TaskCompletionSource? FinishExecute { get; set; }
		public Inventory Inventory { get; set; } =
			new([], [new InventoryHost("host-1", null, null, null, [], "unknown", null, null, null)]);
		public IReadOnlyList<InventoryHostFacts> HostFacts { get; set; } = [];
		public int FactsCalls { get; private set; }

		public Task<IReadOnlyList<Playbook>> ListPlaybooksAsync(CancellationToken ct = default) =>
			Task.FromResult<IReadOnlyList<Playbook>>([new("playbooks/site.yml", "site", "base")]);

		public Task<Inventory> GetInventoryAsync(CancellationToken ct = default) =>
			Task.FromResult(Inventory);

		public Task<IReadOnlyList<InventoryHostFacts>> GetInventoryHostFactsAsync(CancellationToken ct = default)
		{
			FactsCalls++;
			return Task.FromResult(HostFacts);
		}

		public Task<string?> GetHostVarsAsync(string host, CancellationToken ct = default) => Task.FromResult<string?>(null);

		public async Task<int> ExecutePlaybookAsync(string playbook, RunOptions options, Func<string, Task> onOutput, CancellationToken ct)
		{
			ExecuteStarted?.SetResult();
			if (FinishExecute is not null) await FinishExecute.Task.WaitAsync(ct);
			return 0;
		}
	}

	private sealed class FakeNotifier : IRealtimeNotifier
	{
		public int RepositoryChangedCalls { get; private set; }
		public int RepositoryStatusChangedCalls { get; private set; }
		public Task RunOutputAsync(Guid runId, string chunk) => Task.CompletedTask;
		public Task RunChangedAsync(Run run) => Task.CompletedTask;
		public Task RepositoryChangedAsync(RepositoryStatus status)
		{
			RepositoryChangedCalls++;
			return Task.CompletedTask;
		}
		public Task RepositoryStatusChangedAsync(RepositoryStatus status)
		{
			RepositoryStatusChangedCalls++;
			return Task.CompletedTask;
		}
	}
}
