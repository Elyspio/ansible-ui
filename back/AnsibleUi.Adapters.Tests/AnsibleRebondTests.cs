using AnsibleUi.Adapters.Ansible;
using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using Microsoft.Extensions.Options;
using Shouldly;
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

		inventory.Hosts.Select(host => host.Name).ShouldBe(["web-1"]);
		inventory.Groups.ShouldHaveSingleItem();
		inventory.Groups.ShouldNotContain(group => group.Name == "_meta");
	}

	[Fact]
	public async Task Inventory_validation_parses_the_given_directory_strictly_and_drops_hostvars()
	{
		var commands = new FakeCommands("""
			{"_meta":{"hostvars":{"web-1":{"secret":"decrypted"}}},"all":{"children":["web"]},"web":{"hosts":["web-1"]}}
			""");
		IAnsibleRebond rebond = Create(commands);

		var validation = await rebond.ValidateInventoryAsync("/srv/drafts/it's", TestContext.Current.CancellationToken);

		validation.Valid.ShouldBeTrue();
		validation.Hosts.ShouldBe(["web-1"]);
		validation.Groups.ShouldHaveSingleItem().Name.ShouldBe("web");
		commands.LastScript.ShouldBe(
			"cd '/srv/drafts/it'\\''s' && ANSIBLE_NOCOLOR=1 ANSIBLE_INVENTORY_UNPARSED_FAILED=True " +
			"ANSIBLE_INVENTORY_ANY_UNPARSED_IS_FAILED=True ansible-inventory --list");
	}

	[Fact]
	public async Task Inventory_validation_reports_the_error_tail_instead_of_throwing()
	{
		var commands = new FakeCommands("")
		{
			Result = new RemoteCommandResult("", "ERROR! Unable to parse inventory/hosts.yml\npassword: decrypted-secret\n", 1),
		};
		IAnsibleRebond rebond = Create(commands);

		var validation = await rebond.ValidateInventoryAsync("/srv/drafts/x", TestContext.Current.CancellationToken);

		validation.Valid.ShouldBeFalse();
		validation.Error.ShouldBe("Ansible could not parse the draft inventory. Check its inventory files and ansible.cfg.");
		validation.Error.ShouldNotBeNull().ShouldNotContain("decrypted-secret", Case.Sensitive);
		validation.Hosts.ShouldBeEmpty();
	}

	[Fact]
	public async Task Inventory_host_facts_expose_allowlisted_values_only()
	{
		var commands = new FakeCommands("""
			web-1 | SUCCESS => {"ansible_facts":{"ansible_os_family":"Debian","ansible_distribution":"Debian","ansible_default_ipv4":{"address":"10.0.0.1"},"ansible_uptime_seconds":3600,"secret":"never"}}
			web-2 | UNREACHABLE! => {"changed":false,"unreachable":true}
			web-3 | FAILED! => {"failed":true,"msg":"Python interpreter missing"}
			""");
		IAnsibleRebond rebond = Create(commands);

		var facts = await rebond.GetInventoryHostFactsAsync(TestContext.Current.CancellationToken);

		facts.Count.ShouldBe(3);
		facts[0].ShouldSatisfyAllConditions(
			fact => fact.Status.ShouldBe("reachable"),
			fact => fact.Ip.ShouldBe("10.0.0.1"),
			fact => fact.Uptime.ShouldBe(TimeSpan.FromHours(1)));
		facts[1].Status.ShouldBe("unreachable");
		facts[2].ShouldSatisfyAllConditions(
			fact => fact.Status.ShouldBe("unknown"),
			fact => fact.Error.ShouldBe("Python interpreter missing"));
		commands.LastScript.ShouldContain("filter=ansible_os_family,ansible_distribution,ansible_default_ipv4,ansible_uptime_seconds", Case.Sensitive);
	}

	[Fact]
	public async Task Host_vars_rejects_shell_metacharacters()
	{
		IAnsibleRebond rebond = Create(new FakeCommands(""));

		await Should.ThrowAsync<HttpException>(() =>
			rebond.GetHostVarsAsync("web;cat /etc/shadow", TestContext.Current.CancellationToken));
	}

	[Fact]
	public async Task Run_streams_ansible_output_through_transport()
	{
		var commands = new FakeCommands("") { StreamingOutput = "PLAY [site]" };
		IAnsibleRebond rebond = Create(commands);
		var output = new List<string>();

		var exitCode = await rebond.ExecutePlaybookAsync(
			"playbooks/site.yml", new RunOptions(), null, chunk => { output.Add(chunk); return Task.CompletedTask; }, TestContext.Current.CancellationToken);

		exitCode.ShouldBe(0);
		output.ShouldBe(["PLAY [site]"]);
		commands.LastScript.ShouldContain("ansible-playbook 'playbooks/site.yml'", Case.Sensitive);
	}

	[Fact]
	public async Task Run_of_a_draft_executes_from_its_worktree()
	{
		var commands = new FakeCommands("");
		IAnsibleRebond rebond = Create(commands);

		await rebond.ExecutePlaybookAsync(
			"playbooks/site.yml", new RunOptions(), "/srv/ansible.drafts/runs/42/ansible", _ => Task.CompletedTask, TestContext.Current.CancellationToken);

		commands.LastScript.ShouldStartWith("cd '/srv/ansible.drafts/runs/42/ansible' && exec env", Case.Sensitive);
	}

	[Fact]
	public async Task Run_accepts_only_new_ssh_host_keys_when_enabled()
	{
		var commands = new FakeCommands("");
		IAnsibleRebond rebond = Create(commands, acceptNewSshHostKeys: true);

		await rebond.ExecutePlaybookAsync(
			"playbooks/site.yml", new RunOptions(), null, _ => Task.CompletedTask, TestContext.Current.CancellationToken);

		commands.LastScript.ShouldContain("--ssh-common-args '-o StrictHostKeyChecking=accept-new'", Case.Sensitive);
	}

	private static IAnsibleRebond Create(FakeCommands commands, bool acceptNewSshHostKeys = false) => new AnsibleRebond(commands,
		Options.Create(new AnsibleOptions
		{
			WorkingDirectory = "/srv/ansible",
			AcceptNewSshHostKeys = acceptNewSshHostKeys,
		}));

	private sealed class FakeCommands(string output) : IRemoteCommandExecutor
	{
		public string LastScript { get; private set; } = "";
		public string LastOutput => output;
		public string? StreamingOutput { get; set; }
		public RemoteCommandResult? Result { get; set; }
		public Task<RemoteCommandResult> ExecuteAsync(string script, CancellationToken ct = default)
		{
			LastScript = script;
			return Task.FromResult(Result ?? new RemoteCommandResult(output, "", 0));
		}
		public async Task<RemoteCommandResult> ExecuteStreamingAsync(string script, Func<string, Task> onOutput, CancellationToken ct = default)
		{
			LastScript = script;
			if (StreamingOutput is not null) await onOutput(StreamingOutput);
			return new RemoteCommandResult("", "", 0);
		}
	}
}
