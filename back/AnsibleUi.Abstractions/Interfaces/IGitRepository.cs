namespace AnsibleUi.Abstractions.Interfaces;

public interface IGitRepository
{
	Task<string> GetRemoteRevisionAsync(CancellationToken ct = default);
	Task SynchronizeAsync(CancellationToken ct = default);
	Task<string> GetLocalRevisionAsync(CancellationToken ct = default);
	Task<bool> HasTrackedChangesAsync(CancellationToken ct = default);
	Task<bool> HasExpectedConfigurationAsync(CancellationToken ct = default);
}
