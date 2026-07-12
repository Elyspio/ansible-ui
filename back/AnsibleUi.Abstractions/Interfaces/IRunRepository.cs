using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Abstractions.Interfaces;

public interface IRunRepository
{
	Task InsertAsync(Run run, CancellationToken ct = default);

	/// <summary>Full run, output included.</summary>
	Task<Run?> GetAsync(Guid id, CancellationToken ct = default);

	/// <summary>History page, newest first, without output (kept light for lists).</summary>
	Task<IReadOnlyList<Run>> ListAsync(int skip, int take, CancellationToken ct = default);

	Task SetStatusAsync(Guid id, RunStatus status, DateTime? startedAt = null, DateTime? finishedAt = null, int? exitCode = null, CancellationToken ct = default);

	Task AppendOutputAsync(Guid id, string chunk, CancellationToken ct = default);

	Task SetRecapAsync(Guid id, IReadOnlyList<HostRecap> recap, CancellationToken ct = default);

	/// <summary>Runs left Running by a previous backend instance — their real outcome is unknown.</summary>
	Task<long> MarkRunningAsInterruptedAsync(CancellationToken ct = default);

	/// <summary>Queued runs, oldest first, to re-enqueue after a restart.</summary>
	Task<IReadOnlyList<Run>> ListQueuedAsync(CancellationToken ct = default);
}
