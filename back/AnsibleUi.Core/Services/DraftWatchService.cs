using AnsibleUi.Abstractions.Interfaces;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AnsibleUi.Core.Services;

/// <summary>Follows open Brouillons at the repository probe interval: reference-branch drift and pull request outcome.</summary>
public sealed class DraftWatchService(
	DraftService drafts,
	IRepositorySynchronizer synchronizer,
	IOptions<RepositorySynchronizationOptions> options,
	ILogger<DraftWatchService> logger) : BackgroundService
{
	protected override async Task ExecuteAsync(CancellationToken stoppingToken)
	{
		while (!stoppingToken.IsCancellationRequested)
		{
			try
			{
				await drafts.ReconcileAsync(synchronizer.Status.RemoteRevision, stoppingToken);
				await Task.Delay(options.Value.ProbeInterval, stoppingToken);
			}
			catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
			{
				break;
			}
			catch (Exception e)
			{
				logger.LogError(e, "Brouillon watch iteration failed");
				await Task.Delay(options.Value.ProbeInterval, stoppingToken);
			}
		}
	}
}
