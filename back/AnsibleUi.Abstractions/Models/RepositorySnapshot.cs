namespace AnsibleUi.Abstractions.Models;

public sealed record RepositorySnapshot(
	string Revision,
	IReadOnlyList<Playbook> Playbooks,
	Inventory Inventory);
