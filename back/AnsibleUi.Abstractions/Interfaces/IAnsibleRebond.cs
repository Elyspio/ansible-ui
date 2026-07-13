using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Abstractions.Interfaces;

public interface IAnsibleRebond
{
	Task<IReadOnlyList<Playbook>> ListPlaybooksAsync(CancellationToken ct = default);
	Task<Inventory> GetInventoryAsync(CancellationToken ct = default);
	Task<string?> GetHostVarsAsync(string host, CancellationToken ct = default);
	Task<int> ExecutePlaybookAsync(string playbook, RunOptions options, Func<string, Task> onOutput, CancellationToken ct);
}
