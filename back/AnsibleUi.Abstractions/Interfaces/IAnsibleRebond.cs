using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Abstractions.Interfaces;

public interface IAnsibleRebond
{
	Task<IReadOnlyList<Playbook>> ListPlaybooksAsync(CancellationToken ct = default);
	Task<Inventory> GetInventoryAsync(CancellationToken ct = default);
	/// <summary>Parses the inventory of another Ansible directory (a Brouillon worktree); parse failures are a result, not an exception.</summary>
	Task<InventoryValidation> ValidateInventoryAsync(string workingDirectory, CancellationToken ct = default);
	Task<IReadOnlyList<InventoryHostFacts>> GetInventoryHostFactsAsync(CancellationToken ct = default);
	Task<string?> GetHostVarsAsync(string host, CancellationToken ct = default);
	/// <param name="workingDirectory">Ansible directory to run from; null for the authoritative clone.</param>
	Task<int> ExecutePlaybookAsync(string playbook, RunOptions options, string? workingDirectory, Func<string, Task> onOutput, CancellationToken ct);
}
