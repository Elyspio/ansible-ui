using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AnsibleUi.Adapters.Git;

public static class GitModule
{
	public static IServiceCollection AddAnsibleUiGit(this IServiceCollection services, IConfiguration config)
	{
		services.AddOptions<GitRepositoryOptions>()
			.Bind(config.GetSection(GitRepositoryOptions.SectionName))
			.ValidateDataAnnotations()
			.Validate(options => PosixShell.IsAbsolute(options.Path), "GitRepository:Path must be an absolute POSIX path")
			.ValidateOnStart();
		services.AddSingleton<IGitRepository, GitRepository>();
		return services;
	}
}
