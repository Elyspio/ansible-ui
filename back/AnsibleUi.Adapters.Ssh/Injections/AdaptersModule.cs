using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Adapters.Ssh.Ssh;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AnsibleUi.Adapters.Ssh.Injections;

public static class AdaptersModule
{
	public static IServiceCollection AddAnsibleUiAdapters(this IServiceCollection services, IConfiguration config)
	{
		services.AddOptions<SshConnectionOptions>()
			.Bind(config.GetSection(SshConnectionOptions.SectionName))
			.ValidateDataAnnotations()
			.ValidateOnStart();
		services.AddSingleton<IRemoteCommandExecutor, SshRemoteCommandExecutor>();
		return services;
	}
}
