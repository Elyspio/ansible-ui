using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Abstractions.Interfaces;

/// <summary>
///     The remote machine where ansible-playbook actually runs (SSH). Owns the Ansible repository
///     clone, the SSH keys to managed hosts and the vault password. The app itself never runs Ansible.
/// </summary>
public interface IControlNode
{
	/// <summary>Refreshes the repository (git pull) and lists executable playbooks.</summary>
	Task<IReadOnlyList<Playbook>> ListPlaybooksAsync(CancellationToken ct = default);

	/// <summary>Groups and hosts from ansible-inventory. Vars are stripped: vault values must never leave the control node.</summary>
	Task<Inventory> GetInventoryAsync(CancellationToken ct = default);

	/// <summary>Raw (undecrypted) content of a host's vars.yml, or null when the host has none.</summary>
	Task<string?> GetHostVarsAsync(string host, CancellationToken ct = default);

	/// <summary>
	///     Refreshes the repository then executes a playbook, invoking <paramref name="onOutput" /> for each
	///     output chunk (raw, ANSI colors preserved). Returns the process exit code. Cancelling
	///     <paramref name="ct" /> interrupts the remote process (SIGINT, then SIGKILL after a grace period).
	/// </summary>
	Task<int> ExecutePlaybookAsync(string playbook, RunOptions options, Func<string, Task> onOutput, CancellationToken ct);
}
