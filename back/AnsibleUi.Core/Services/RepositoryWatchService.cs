using AnsibleUi.Abstractions.Interfaces;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AnsibleUi.Core.Services;

public sealed class RepositoryWatchService(
	IRepositorySynchronizer synchronizer,
	IOptions<RepositorySynchronizationOptions> options,
	ILogger<RepositoryWatchService> logger) : BackgroundService
{
	protected override async Task ExecuteAsync(CancellationToken stoppingToken)
	{
		while (!stoppingToken.IsCancellationRequested)
		{
			try
			{
				await synchronizer.SynchronizeAsync(stoppingToken);
				await Task.Delay(options.Value.ProbeInterval, stoppingToken);
			}
			catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
			{
				break;
			}
			catch (Exception e)
			{
				logger.LogError(e, "Repository watch iteration failed");
			}
		}
	}
}
