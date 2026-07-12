using AnsibleUi.Core.Services;
using AnsibleUi.Abstractions.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;

namespace AnsibleUi.Core.Injections;

public static class CoreModule
{
	public static IServiceCollection AddAnsibleUiCore(this IServiceCollection services, IConfiguration config)
	{
		services.AddOptions<RepositorySynchronizationOptions>()
			.Bind(config.GetSection(RepositorySynchronizationOptions.SectionName))
			.ValidateDataAnnotations()
			.ValidateOnStart();
		services.AddSingleton<RepositorySynchronizer>();
		services.AddSingleton<IRepositorySynchronizer>(sp => sp.GetRequiredService<RepositorySynchronizer>());
		services.AddHostedService<RepositoryWatchService>();
		services.AddSingleton<RunLauncher>();
		services.AddHostedService(sp => sp.GetRequiredService<RunLauncher>());
		return services;
	}
}
