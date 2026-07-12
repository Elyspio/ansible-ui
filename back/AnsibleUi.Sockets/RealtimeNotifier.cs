using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using AnsibleUi.Sockets.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace AnsibleUi.Sockets;

public sealed class RealtimeNotifier(IHubContext<RunHub> hub) : IRealtimeNotifier
{
	public Task RunOutputAsync(Guid runId, string chunk)
	{
		return hub.Clients.Group(RunHub.GroupName(runId)).SendAsync("runOutput", runId, chunk);
	}

	public Task RunChangedAsync(Run run)
	{
		return hub.Clients.All.SendAsync("runChanged", new
		{
			id = run.Id,
			playbook = run.Playbook,
			options = run.Options,
			status = run.Status.ToString(),
			requestedBy = run.RequestedBy,
			createdAt = run.CreatedAt,
			startedAt = run.StartedAt,
			finishedAt = run.FinishedAt,
			exitCode = run.ExitCode,
			recap = run.Recap
		});
	}

	public Task RepositoryChangedAsync(RepositoryStatus status)
	{
		return hub.Clients.All.SendAsync("repositoryChanged", status);
	}

	public Task RepositoryStatusChangedAsync(RepositoryStatus status)
	{
		return hub.Clients.All.SendAsync("repositoryStatusChanged", status);
	}
}
