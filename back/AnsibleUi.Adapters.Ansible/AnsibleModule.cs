using AnsibleUi.Abstractions;
using AnsibleUi.Abstractions.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AnsibleUi.Adapters.Ansible;

public static class AnsibleModule
{
	public static IServiceCollection AddAnsibleUiAnsible(this IServiceCollection services, IConfiguration config)
	{
		services.AddOptions<AnsibleOptions>()
			.Bind(config.GetSection(AnsibleOptions.SectionName))
			.ValidateDataAnnotations()
			.Validate(options => PosixShell.IsAbsolute(options.WorkingDirectory), "Ansible:WorkingDirectory must be an absolute POSIX path")
			.ValidateOnStart();
		services.AddSingleton<IAnsibleRebond, AnsibleRebond>();
		return services;
	}

}
