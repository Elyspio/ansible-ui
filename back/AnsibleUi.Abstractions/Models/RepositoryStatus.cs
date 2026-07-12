namespace AnsibleUi.Abstractions.Models;

public sealed record RepositoryStatus(
	string? Revision,
	string? RemoteRevision,
	DateTimeOffset? LastCheckedAt,
	DateTimeOffset? LastSynchronizedAt,
	bool IsSynchronizing,
	bool IsRunningPlaybook,
	bool IsDegraded,
	string? Error);
