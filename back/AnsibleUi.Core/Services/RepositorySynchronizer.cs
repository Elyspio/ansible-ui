using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using Microsoft.Extensions.Logging;

namespace AnsibleUi.Core.Services;

public sealed class RepositorySynchronizer(
	IGitRepository gitRepository,
	IAnsibleRebond ansibleRebond,
	IRealtimeNotifier notifier,
	ILogger<RepositorySynchronizer> logger) : IRepositorySynchronizer
{
	private readonly Lock _syncTaskLock = new();
	private readonly Lock _statusLock = new();
	private readonly SemaphoreSlim _repositoryLock = new(1, 1);
	private readonly SemaphoreSlim _inventoryFactsLock = new(1, 1);
	private RepositorySnapshot? _snapshot;
	private Inventory? _inventoryWithFacts;
	private DateTimeOffset? _inventoryFactsExpiresAt;
	private string? _inventoryFactsRevision;
	private Task<RepositoryStatus>? _syncTask;
	private RepositoryStatus _status = new(null, null, null, null, false, false, false, null);

	public RepositoryStatus Status
	{
		get
		{
			lock (_statusLock) return _status;
		}
	}

	public async Task<RepositorySnapshot> GetSnapshotAsync(CancellationToken ct = default)
	{
		if (_snapshot is not null)
			return _snapshot;

		await SynchronizeAsync(ct);
		return _snapshot ?? throw new InvalidOperationException(
			$"The Ansible repository is unavailable: {Status.Error}");
	}

	public async Task<Inventory> GetInventoryAsync(CancellationToken ct = default)
	{
		var snapshot = await GetSnapshotAsync(ct);
		if (HasFreshInventoryFacts(snapshot.Revision)) return _inventoryWithFacts!;

		await _inventoryFactsLock.WaitAsync(ct);
		try
		{
			if (HasFreshInventoryFacts(snapshot.Revision)) return _inventoryWithFacts!;

			await _repositoryLock.WaitAsync(ct);
			try
			{
				var facts = await ansibleRebond.GetInventoryHostFactsAsync(ct);
				var checkedAt = DateTimeOffset.UtcNow;
				var byHost = facts.ToDictionary(fact => fact.Name, StringComparer.Ordinal);
				var hosts = snapshot.Inventory.Hosts.Select(host =>
				{
					var groups = snapshot.Inventory.Groups
						.Where(group => group.Hosts.Contains(host.Name, StringComparer.Ordinal))
						.Select(group => group.Name)
						.OrderBy(name => name, StringComparer.Ordinal)
						.ToList();
					if (!byHost.TryGetValue(host.Name, out var fact))
						return host with
						{
							Groups = groups,
							Error = "Fact probe returned no result for this host.",
							LastChecked = checkedAt,
						};
					return host with
					{
						Groups = groups,
						Status = fact.Status,
						Error = fact.Error,
						Ip = fact.Ip,
						Os = fact.Os,
						OsFamily = fact.OsFamily,
						Uptime = fact.Uptime,
						LastChecked = checkedAt,
					};
				}).ToList();
				_inventoryWithFacts = new Inventory(snapshot.Inventory.Groups, hosts);
				_inventoryFactsRevision = snapshot.Revision;
				_inventoryFactsExpiresAt = checkedAt.AddSeconds(60);
				return _inventoryWithFacts;
			}
			finally
			{
				_repositoryLock.Release();
			}
		}
		finally
		{
			_inventoryFactsLock.Release();
		}
	}

	public async Task<RepositoryStatus> SynchronizeAsync(CancellationToken ct = default)
	{
		Task<RepositoryStatus> task;
		lock (_syncTaskLock)
		{
			if (_syncTask is null || _syncTask.IsCompleted)
				_syncTask = SynchronizeCoreAsync();
			task = _syncTask;
		}

		return await task.WaitAsync(ct);
	}

	public async Task<string?> GetHostVarsAsync(string host, CancellationToken ct = default)
	{
		await GetSnapshotAsync(ct);
		await _repositoryLock.WaitAsync(ct);
		try
		{
			return await ansibleRebond.GetHostVarsAsync(host, ct);
		}
		finally
		{
			_repositoryLock.Release();
		}
	}

	public async Task<int> ExecutePlaybookAsync(
		string playbook,
		RunOptions options,
		Func<string, Task> onOutput,
		CancellationToken ct)
	{
		await _repositoryLock.WaitAsync(ct);
		try
		{
			UpdateStatus(status => status with { IsRunningPlaybook = true });
			await NotifyStatusAsync();
			try
			{
				await RefreshSnapshotUnderLockAsync(checkRemote: true, ct);
				UpdateStatus(status => status with
				{
					LastCheckedAt = DateTimeOffset.UtcNow,
					IsDegraded = false,
					Error = null
				});
				await NotifyStatusAsync();
			}
			catch (Exception e)
			{
				UpdateStatus(status => status with
				{
					LastCheckedAt = DateTimeOffset.UtcNow,
					IsDegraded = true,
					Error = e.Message
				});
				await NotifyStatusAsync();
				throw;
			}
			return await ansibleRebond.ExecutePlaybookAsync(playbook, options, onOutput, ct);
		}
		finally
		{
			UpdateStatus(status => status with { IsRunningPlaybook = false });
			await NotifyStatusAsync();
			_repositoryLock.Release();
		}
	}

	private async Task<RepositoryStatus> SynchronizeCoreAsync()
	{
		UpdateStatus(status => status with { IsSynchronizing = true, Error = null });
		await NotifyStatusAsync();
		try
		{
			var remoteRevision = await gitRepository.GetRemoteRevisionAsync();
			UpdateStatus(status => status with
			{
				RemoteRevision = remoteRevision,
				LastCheckedAt = DateTimeOffset.UtcNow
			});

			if (_snapshot?.Revision != remoteRevision)
			{
				await _repositoryLock.WaitAsync();
				try
				{
					await RefreshSnapshotUnderLockAsync(checkRemote: false, CancellationToken.None);
				}
				finally
				{
					_repositoryLock.Release();
				}
			}

			UpdateStatus(status => status with { IsSynchronizing = false, IsDegraded = false, Error = null });
		}
		catch (Exception e)
		{
			logger.LogError(e, "Failed to synchronize the Ansible repository");
			UpdateStatus(status => status with
			{
				LastCheckedAt = DateTimeOffset.UtcNow,
				IsSynchronizing = false,
				IsDegraded = true,
				Error = e.Message
			});
		}

		await NotifyStatusAsync();
		return Status;
	}

	private async Task RefreshSnapshotUnderLockAsync(bool checkRemote, CancellationToken ct)
	{
		var remoteRevision = checkRemote ? await gitRepository.GetRemoteRevisionAsync(ct) : Status.RemoteRevision!;
		var mustReconcile = checkRemote &&
			(await gitRepository.HasTrackedChangesAsync(ct) ||
			 !await gitRepository.HasExpectedConfigurationAsync(ct));
		var synchronized = _snapshot?.Revision != remoteRevision || mustReconcile;
		if (synchronized)
			await gitRepository.SynchronizeAsync(ct);

		var localRevision = await gitRepository.GetLocalRevisionAsync(ct);
		if (!string.Equals(localRevision, remoteRevision, StringComparison.Ordinal))
			throw new InvalidOperationException(
				$"Local revision '{localRevision}' does not match remote revision '{remoteRevision}'");

		var playbooks = await ansibleRebond.ListPlaybooksAsync(ct);
		var inventory = await ansibleRebond.GetInventoryAsync(ct);
		var changed = _snapshot?.Revision != localRevision;
		_snapshot = new RepositorySnapshot(localRevision, playbooks, inventory);
		_inventoryWithFacts = null;
		_inventoryFactsExpiresAt = null;
		_inventoryFactsRevision = null;
		UpdateStatus(status => status with
		{
			Revision = localRevision,
			RemoteRevision = remoteRevision,
			LastSynchronizedAt = synchronized ? DateTimeOffset.UtcNow : status.LastSynchronizedAt
		});

		if (changed)
			await notifier.RepositoryChangedAsync(Status);
	}

	private async Task NotifyStatusAsync()
	{
		try
		{
			await notifier.RepositoryStatusChangedAsync(Status);
		}
		catch (Exception e)
		{
			logger.LogWarning(e, "Failed to publish repository status");
		}
	}

	private void UpdateStatus(Func<RepositoryStatus, RepositoryStatus> update)
	{
		lock (_statusLock) _status = update(_status);
	}

	private bool HasFreshInventoryFacts(string revision) =>
		_inventoryWithFacts is not null &&
		_inventoryFactsRevision == revision &&
		_inventoryFactsExpiresAt > DateTimeOffset.UtcNow;
}
