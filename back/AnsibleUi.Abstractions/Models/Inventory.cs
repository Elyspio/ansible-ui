namespace AnsibleUi.Abstractions.Models;

/// <summary>Read-only view of Ansible inventory structure and allowlisted host facts. Vault values never leave Rebond.</summary>
public sealed record Inventory(IReadOnlyList<InventoryGroup> Groups, IReadOnlyList<InventoryHost> Hosts);

/// <param name="Name">Group name (e.g. "db", "kube").</param>
/// <param name="Hosts">Direct member hosts.</param>
/// <param name="Children">Child group names.</param>
public sealed record InventoryGroup(string Name, IReadOnlyList<string> Hosts, IReadOnlyList<string> Children);

/// <summary>Safe, read-only host information collected through Ansible setup facts.</summary>
/// <param name="Name">Ansible host name.</param>
/// <param name="Ip">Default IPv4 address when Ansible reports one.</param>
/// <param name="Os">Ansible distribution name when available.</param>
/// <param name="OsFamily">Ansible operating-system family when available.</param>
/// <param name="Groups">Direct Ansible groups containing host.</param>
/// <param name="Status">Reachability state: reachable, unreachable, or unknown.</param>
/// <param name="Error">Safe Ansible probe error when host facts are unavailable.</param>
/// <param name="Uptime">Host uptime when Ansible reports one.</param>
/// <param name="LastChecked">UTC time fact probe ran.</param>
public sealed record InventoryHost(
	string Name,
	string? Ip,
	string? Os,
	string? OsFamily,
	IReadOnlyList<string> Groups,
	string Status,
	string? Error,
	TimeSpan? Uptime,
	DateTimeOffset? LastChecked);

/// <summary>Allowlisted result of a single host fact probe.</summary>
public sealed record InventoryHostFacts(
	string Name,
	string Status,
	string? Ip,
	string? Os,
	string? OsFamily,
	string? Error,
	TimeSpan? Uptime);
