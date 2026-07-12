namespace AnsibleUi.Abstractions.Models;

/// <summary>Read-only view of the Ansible inventory: groups and their hosts. No vars — vault values must never leave the control node.</summary>
public sealed record Inventory(IReadOnlyList<InventoryGroup> Groups, IReadOnlyList<string> Hosts);

/// <param name="Name">Group name (e.g. "db", "kube").</param>
/// <param name="Hosts">Direct member hosts.</param>
/// <param name="Children">Child group names.</param>
public sealed record InventoryGroup(string Name, IReadOnlyList<string> Hosts, IReadOnlyList<string> Children);
