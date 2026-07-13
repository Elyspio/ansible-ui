using AnsibleUi.Adapters.Ansible;
using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using Microsoft.Extensions.Options;
using Xunit;

namespace AnsibleUi.Adapters.Tests;

public sealed class AnsibleRebondTests
{
	[Fact]
	public async Task Inventory_strips_hostvars_before_crossing_adapter_interface()
	{
		var commands = new FakeCommands("""
			{"_meta":{"hostvars":{"web-1":{"secret":"decrypted"}}},"web":{"hosts":["web-1"]},"ungrouped":{"hosts":[]}}
			""");
		IAnsibleRebond rebond = Create(commands);

		var inventory = await rebond.GetInventoryAsync(TestContext.Current.CancellationToken);

		Assert.Equal(["web-1"], inventory.Hosts);
		Assert.Single(inventory.Groups);
		Assert.DoesNotContain(inventory.Groups, group => group.Name == "_meta");
	}

	[Fact]
	public async Task Host_vars_rejects_shell_metacharacters()
	{
		IAnsibleRebond rebond = Create(new FakeCommands(""));

		await Assert.ThrowsAsync<HttpException>(() =>
			rebond.GetHostVarsAsync("web;cat /etc/shadow", TestContext.Current.CancellationToken));
	}

	[Fact]
	public async Task Run_streams_ansible_output_through_transport()
	{
		var commands = new FakeCommands("") { StreamingOutput = "PLAY [site]" };
		IAnsibleRebond rebond = Create(commands);
		var output = new List<string>();

		var exitCode = await rebond.ExecutePlaybookAsync(
			"playbooks/site.yml", new RunOptions(), chunk => { output.Add(chunk); return Task.CompletedTask; }, TestContext.Current.CancellationToken);

		Assert.Equal(0, exitCode);
		Assert.Equal(["PLAY [site]"], output);
		Assert.Contains("ansible-playbook 'playbooks/site.yml'", commands.LastScript);
	}

	private static IAnsibleRebond Create(FakeCommands commands) => new AnsibleRebond(commands,
		Options.Create(new AnsibleOptions { WorkingDirectory = "/srv/ansible" }));

	private sealed class FakeCommands(string output) : IRemoteCommandExecutor
	{
		public string LastScript { get; private set; } = "";
		public string LastOutput => output;
		public string? StreamingOutput { get; set; }
		public Task<RemoteCommandResult> ExecuteAsync(string script, CancellationToken ct = default)
		{
			LastScript = script;
			return Task.FromResult(new RemoteCommandResult(output, "", 0));
		}
		public async Task<RemoteCommandResult> ExecuteStreamingAsync(string script, Func<string, Task> onOutput, CancellationToken ct = default)
		{
			LastScript = script;
			if (StreamingOutput is not null) await onOutput(StreamingOutput);
			return new RemoteCommandResult("", "", 0);
		}
	}
}
