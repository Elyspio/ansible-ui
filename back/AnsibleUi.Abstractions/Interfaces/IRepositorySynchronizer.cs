using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Abstractions.Interfaces;

public interface IRepositorySynchronizer
{
	RepositoryStatus Status { get; }
	Task<RepositorySnapshot> GetSnapshotAsync(CancellationToken ct = default);
	Task<RepositoryStatus> SynchronizeAsync(CancellationToken ct = default);
	Task<string?> GetHostVarsAsync(string host, CancellationToken ct = default);
	Task<int> ExecutePlaybookAsync(
		string playbook,
		RunOptions options,
		Func<string, Task> onOutput,
		CancellationToken ct);
}
