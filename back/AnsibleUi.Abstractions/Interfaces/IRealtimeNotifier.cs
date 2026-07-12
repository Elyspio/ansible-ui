using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Abstractions.Interfaces;

/// <summary>Pushes run progress to connected clients (SignalR).</summary>
public interface IRealtimeNotifier
{
	/// <summary>New output chunk for a run — sent to clients watching that run.</summary>
	Task RunOutputAsync(Guid runId, string chunk);

	/// <summary>Status transition (Queued→Running→terminal) — broadcast, so lists refresh everywhere.</summary>
	Task RunChangedAsync(Run run);
}
