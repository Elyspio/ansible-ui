using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

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
		services.AddOptions<DraftWorkspaceOptions>()
			.Bind(config.GetSection(DraftWorkspaceOptions.SectionName))
			.Configure<IOptions<GitRepositoryOptions>>((options, git) =>
			{
				if (string.IsNullOrWhiteSpace(options.Root)) options.Root = $"{git.Value.Path.TrimEnd('/')}.drafts";
			})
			.ValidateDataAnnotations()
			.Validate(options => PosixShell.IsAbsolute(options.Root), "Drafts:Root must be an absolute POSIX path")
			.Validate<IOptions<GitRepositoryOptions>>(
				(options, git) => !PosixShell.IsContainedIn(options.Root, git.Value.Path) && !PosixShell.IsContainedIn(git.Value.Path, options.Root),
				"Drafts:Root must not overlap GitRepository:Path")
			.ValidateOnStart();
		services.AddSingleton<IGitRepository, GitRepository>();
		services.AddSingleton<IDraftWorkspace, DraftWorkspace>();
		services.AddSingleton<IRepositoryFiles, RepositoryFiles>();
		return services;
	}
}
