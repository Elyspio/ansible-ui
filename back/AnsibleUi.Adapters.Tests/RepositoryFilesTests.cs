using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using AnsibleUi.Adapters.Git;
using Microsoft.Extensions.Options;
using Shouldly;
using Xunit;

namespace AnsibleUi.Adapters.Tests;

public sealed class RepositoryFilesTests
{
	private static readonly string Revision = new('a', 40);

	[Fact]
	public async Task Published_files_are_read_from_git_objects_of_the_snapshot_revision()
	{
		var commands = new FakeCommands("5\naGVsbG8=");

		var file = await Create(commands).ReadFileAsync(Revision, "inventory/hosts.yml", TestContext.Current.CancellationToken);

		file.Content.ShouldBe("hello");
		commands.LastScript.ShouldStartWith("cd '/srv/ansible' || exit 1; o='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:ansible/inventory/hosts.yml';", Case.Sensitive);
		commands.LastScript.ShouldNotContain("checkout");
	}

	[Fact]
	public async Task Listing_is_scoped_to_the_ansible_directory()
	{
		var commands = new FakeCommands("ansible/site.yml\0ansible/inventory/hosts.yml\0");

		var files = await Create(commands).ListFilesAsync(Revision, TestContext.Current.CancellationToken);

		files.ShouldBe(["inventory/hosts.yml", "site.yml"]);
		commands.LastScript.ShouldBe($"git -C '/srv/ansible' ls-tree -r -z --name-only '{Revision}' -- 'ansible'");
	}

	[Theory]
	[InlineData("main")]
	[InlineData("HEAD")]
	[InlineData("aaaa; rm -rf /")]
	public async Task Only_full_object_names_are_accepted(string revision)
	{
		var commands = new FakeCommands("");

		await Should.ThrowAsync<HttpException>(() => Create(commands).ListFilesAsync(revision, TestContext.Current.CancellationToken));

		commands.LastScript.ShouldBeEmpty();
	}

	private static RepositoryFiles Create(FakeCommands commands) => new(commands,
		Options.Create(new GitRepositoryOptions { Path = "/srv/ansible", Url = "ssh://git@example/ansible.git", Branch = "main" }),
		Options.Create(new DraftWorkspaceOptions { Root = "/srv/ansible.drafts", AnsibleDirectory = "ansible" }));

	private sealed class FakeCommands(string output) : IRemoteCommandExecutor
	{
		public string LastScript { get; private set; } = "";

		public Task<RemoteCommandResult> ExecuteAsync(string script, CancellationToken ct = default)
		{
			LastScript = script;
			return Task.FromResult(new RemoteCommandResult(output, "", 0));
		}

		public Task<RemoteCommandResult> ExecuteStreamingAsync(string script, Func<string, Task> onOutput, CancellationToken ct = default) =>
			throw new NotSupportedException();
	}
}
