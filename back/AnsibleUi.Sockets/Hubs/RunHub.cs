using Microsoft.AspNetCore.SignalR;

namespace AnsibleUi.Sockets.Hubs;

/// <summary>
///     Live run updates. Status changes are broadcast to everyone; output chunks only go to
///     clients watching a given run (group "run-{id}").
/// </summary>
public sealed class RunHub : Hub
{
	public Task WatchRun(Guid runId)
	{
		return Groups.AddToGroupAsync(Context.ConnectionId, GroupName(runId));
	}

	public Task UnwatchRun(Guid runId)
	{
		return Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(runId));
	}

	internal static string GroupName(Guid runId)
	{
		return $"run-{runId}";
	}
}
