using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using Microsoft.Extensions.Logging;

namespace AnsibleUi.Core.Services;

public sealed class RepositorySynchronizer(
	IControlNode controlNode,
	IRealtimeNotifier notifier,
	ILogger<RepositorySynchronizer> logger) : IRepositorySynchronizer
{
	private readonly Lock _syncTaskLock = new();
	private readonly Lock _statusLock = new();
	private readonly SemaphoreSlim _repositoryLock = new(1, 1);
	private RepositorySnapshot? _snapshot;
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
			return await controlNode.GetHostVarsAsync(host, ct);
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
			return await controlNode.ExecutePlaybookAsync(playbook, options, onOutput, ct);
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
			var remoteRevision = await controlNode.GetRemoteRevisionAsync();
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
		var remoteRevision = checkRemote ? await controlNode.GetRemoteRevisionAsync(ct) : Status.RemoteRevision!;
		var mustReconcile = checkRemote &&
			(await controlNode.HasTrackedChangesAsync(ct) ||
			 !await controlNode.HasExpectedRepositoryConfigurationAsync(ct));
		var synchronized = _snapshot?.Revision != remoteRevision || mustReconcile;
		if (synchronized)
			await controlNode.SynchronizeRepositoryAsync(ct);

		var localRevision = await controlNode.GetLocalRevisionAsync(ct);
		if (!string.Equals(localRevision, remoteRevision, StringComparison.Ordinal))
			throw new InvalidOperationException(
				$"Local revision '{localRevision}' does not match remote revision '{remoteRevision}'");

		var playbooks = await controlNode.ListPlaybooksAsync(ct);
		var inventory = await controlNode.GetInventoryAsync(ct);
		var changed = _snapshot?.Revision != localRevision;
		_snapshot = new RepositorySnapshot(localRevision, playbooks, inventory);
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
}
