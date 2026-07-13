using AnsibleUi.Adapters.Git;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using Microsoft.Extensions.Options;
using Xunit;

namespace AnsibleUi.Adapters.Tests;

public sealed class GitRepositoryTests
{
	[Fact]
	public async Task Synchronize_resets_configured_branch_without_cleaning_untracked_files()
	{
		var commands = new FakeCommands();
		IGitRepository repository = new GitRepository(commands, Options.Create(new GitRepositoryOptions
		{
			Path = "/srv/ansible",
			Url = "ssh://git@example/ansible.git",
			Branch = "main"
		}));

		await repository.SynchronizeAsync(TestContext.Current.CancellationToken);

		var script = Assert.Single(commands.Scripts);
		Assert.Contains("git remote set-url origin 'ssh://git@example/ansible.git'", script);
		Assert.Contains("git checkout -B 'main' origin/'main'", script);
		Assert.Contains("git reset --hard origin/'main'", script);
		Assert.DoesNotContain("git clean", script);
	}

	private sealed class FakeCommands : IRemoteCommandExecutor
	{
		public List<string> Scripts { get; } = [];
		public Task<RemoteCommandResult> ExecuteAsync(string script, CancellationToken ct = default)
		{
			Scripts.Add(script);
			return Task.FromResult(new RemoteCommandResult("", "", 0));
		}
		public Task<RemoteCommandResult> ExecuteStreamingAsync(string script, Func<string, Task> onOutput, CancellationToken ct = default) =>
			throw new NotSupportedException();
	}
}
