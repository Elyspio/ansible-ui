using AnsibleUi.Core.Services;
using Microsoft.Extensions.DependencyInjection;

namespace AnsibleUi.Core.Injections;

public static class CoreModule
{
	public static IServiceCollection AddAnsibleUiCore(this IServiceCollection services)
	{
		services.AddSingleton<RunLauncher>();
		services.AddHostedService(sp => sp.GetRequiredService<RunLauncher>());
		return services;
	}
}
