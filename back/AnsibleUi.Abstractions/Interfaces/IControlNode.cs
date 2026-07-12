using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Abstractions.Interfaces;

/// <summary>
///     The remote machine where ansible-playbook actually runs (SSH). Owns the Ansible repository
///     clone, the SSH keys to managed hosts and the vault password. The app itself never runs Ansible.
/// </summary>
public interface IControlNode
{
	/// <summary>Returns the configured branch revision advertised by the Git server.</summary>
	Task<string> GetRemoteRevisionAsync(CancellationToken ct = default);

	/// <summary>Clones or resets the repository to the configured remote branch.</summary>
	Task SynchronizeRepositoryAsync(CancellationToken ct = default);

	/// <summary>Returns HEAD of the repository clone.</summary>
	Task<string> GetLocalRevisionAsync(CancellationToken ct = default);

	/// <summary>Whether tracked files differ from HEAD. Untracked and ignored files are excluded.</summary>
	Task<bool> HasTrackedChangesAsync(CancellationToken ct = default);

	/// <summary>Whether origin URL and current branch match configured values.</summary>
	Task<bool> HasExpectedRepositoryConfigurationAsync(CancellationToken ct = default);

	/// <summary>Lists executable playbooks from the current clone.</summary>
	Task<IReadOnlyList<Playbook>> ListPlaybooksAsync(CancellationToken ct = default);

	/// <summary>Groups and hosts from ansible-inventory. Vars are stripped: vault values must never leave the control node.</summary>
	Task<Inventory> GetInventoryAsync(CancellationToken ct = default);

	/// <summary>Raw (undecrypted) content of a host's vars.yml, or null when the host has none.</summary>
	Task<string?> GetHostVarsAsync(string host, CancellationToken ct = default);

	/// <summary>
	///     Executes a playbook from the current clone, invoking <paramref name="onOutput" /> for each
	///     output chunk (raw, ANSI colors preserved). Returns the process exit code. Cancelling
	///     <paramref name="ct" /> interrupts the remote process (SIGINT, then SIGKILL after a grace period).
	/// </summary>
	Task<int> ExecutePlaybookAsync(string playbook, RunOptions options, Func<string, Task> onOutput, CancellationToken ct);
}
