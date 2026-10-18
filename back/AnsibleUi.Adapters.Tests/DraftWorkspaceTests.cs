using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using AnsibleUi.Adapters.Git;
using Microsoft.Extensions.Options;
using Shouldly;
using Xunit;

namespace AnsibleUi.Adapters.Tests;

public sealed class DraftWorkspaceTests
{
	private static readonly Guid DraftId = Guid.Parse("0196a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b");
	private const string Worktree = "/srv/ansible.drafts/drafts/0196a1b2c3d47e5f8a9b0c1d2e3f4a5b";

	[Fact]
	public async Task Write_guards_symlinks_vault_files_and_concurrent_changes()
	{
		var commands = new FakeCommands();
		var hash = new string('a', 64);

		await Create(commands).WriteFileAsync(DraftId, "roles/web/tasks/main.yml", "- name: ok\n", hash, TestContext.Current.CancellationToken);

		commands.Scripts.Count.ShouldBe(2);
		commands.Scripts[0].ShouldStartWith("mkdir -p '/srv/ansible.drafts/uploads' && printf %s 'LSBuYW1lOiBvawo=' > '/srv/ansible.drafts/uploads/", Case.Sensitive);
		var script = commands.Scripts[1];
		script.ShouldContain($"cd '{Worktree}' || exit 3;", Case.Sensitive);
		script.ShouldContain("ROOT=$(realpath -m -- 'ansible')", Case.Sensitive);
		script.ShouldContain("f='ansible/roles/web/tasks/main.yml'; inside \"$f\" || exit 4;", Case.Sensitive);
		script.ShouldContain("[ -L \"$f\" ] && exit 4;", Case.Sensitive);
		script.ShouldContain("isvault \"$f\" && exit 8;", Case.Sensitive);
		script.ShouldContain($"[ \"$(sha256sum < \"$f\" | cut -d' ' -f1)\" = '{hash}' ] || exit 6;", Case.Sensitive);
		script.ShouldContain("mv -f -- \"$u.bin\" \"$f\"", Case.Sensitive);
	}

	[Fact]
	public async Task Write_of_a_new_file_refuses_to_overwrite()
	{
		var commands = new FakeCommands();

		await Create(commands).WriteFileAsync(DraftId, "playbooks/new.yml", "", null, TestContext.Current.CancellationToken);

		commands.Scripts[0].ShouldContain("printf %s '' >", Case.Sensitive);
		commands.Scripts[1].ShouldContain("[ -e \"$f\" ] && exit 7;", Case.Sensitive);
		commands.Scripts[1].ShouldNotContain("sha256sum");
	}

	[Fact]
	public async Task Large_writes_stay_below_the_shell_argument_limit()
	{
		var commands = new FakeCommands();

		await Create(commands).WriteFileAsync(DraftId, "files/big.txt", new string('x', 300_000), null, TestContext.Current.CancellationToken);

		commands.Scripts.Count.ShouldBe(8);
		commands.Scripts.ShouldAllBe(script => script.Length < 100_000);
		commands.Scripts[1].ShouldContain(" >> '/srv/ansible.drafts/uploads/", Case.Sensitive);
	}

	[Fact]
	public async Task Vault_content_is_never_written()
	{
		var commands = new FakeCommands();

		await Should.ThrowAsync<HttpException>(() => Create(commands).WriteFileAsync(
			DraftId, "group_vars/all/vault.yml", "$ANSIBLE_VAULT;1.1;AES256\n6162", null, TestContext.Current.CancellationToken));

		commands.Scripts.ShouldBeEmpty();
	}

	[Theory]
	[InlineData("../etc/passwd")]
	[InlineData("/etc/passwd")]
	[InlineData("roles/../../outside.yml")]
	[InlineData(".git/config")]
	[InlineData("roles\\web.yml")]
	[InlineData("roles//web.yml")]
	public async Task Paths_leaving_the_ansible_directory_are_rejected_before_any_command(string path)
	{
		var commands = new FakeCommands();

		var error = await Should.ThrowAsync<HttpException>(() =>
			Create(commands).ReadFileAsync(DraftId, path, TestContext.Current.CancellationToken));

		error.StatusCode.ShouldBe(400);
		commands.Scripts.ShouldBeEmpty();
	}

	[Fact]
	public async Task Guard_exit_codes_map_to_http_errors()
	{
		var commands = new FakeCommands { Result = new RemoteCommandResult("", "", 6) };

		var error = await Should.ThrowAsync<HttpException>(() => Create(commands).DeleteFileAsync(
			DraftId, "site.yml", TestContext.Current.CancellationToken));

		error.StatusCode.ShouldBe(409);
	}

	[Fact]
	public async Task Read_flags_vault_files_and_hashes_raw_bytes()
	{
		var vault = "$ANSIBLE_VAULT;1.1;AES256\n3132\n"u8.ToArray();
		var commands = new FakeCommands { Result = new RemoteCommandResult($"{vault.Length}\n{Convert.ToBase64String(vault)}", "", 0) };

		var file = await Create(commands).ReadFileAsync(DraftId, "group_vars/all/vault.yml", TestContext.Current.CancellationToken);

		file.IsVault.ShouldBeTrue();
		file.IsReadOnly.ShouldBeTrue();
		file.Content.ShouldStartWith("$ANSIBLE_VAULT;");
		file.Hash.ShouldBe(Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(vault)));
	}

	[Fact]
	public async Task Read_keeps_binary_files_out_of_the_editor()
	{
		byte[] binary = [0x89, 0x50, 0x4E, 0x47, 0x00, 0xFF];
		var commands = new FakeCommands { Result = new RemoteCommandResult($"{binary.Length}\n{Convert.ToBase64String(binary)}", "", 0) };

		var file = await Create(commands).ReadFileAsync(DraftId, "files/logo.png", TestContext.Current.CancellationToken);

		file.IsBinary.ShouldBeTrue();
		file.Content.ShouldBeNull();
	}

	[Fact]
	public async Task Listing_hides_deleted_files_and_paths_outside_the_ansible_directory()
	{
		var commands = new FakeCommands
		{
			Result = new RemoteCommandResult("ansible/site.yml\0ansible/roles/a.yml\0ansible/new.yml\0\0:deleted:\0ansible/roles/a.yml\0", "", 0)
		};

		var files = await Create(commands).ListFilesAsync(DraftId, TestContext.Current.CancellationToken);

		files.ShouldBe(["new.yml", "site.yml"]);
		commands.Scripts.ShouldHaveSingleItem().ShouldContain("git ls-files -z --cached --others --exclude-standard -- 'ansible'", Case.Sensitive);
	}

	[Fact]
	public async Task Commit_authors_as_the_user_and_never_force_pushes()
	{
		var commands = new FakeCommands { Result = new RemoteCommandResult("abc\n", "", 0) };

		await Create(commands).CommitAndPushAsync(DraftId, "ansible-ui/dev/fix-1234abcd", "Fix 'dns'\nsecond line",
			new CommitAuthor("Dev <User>", "dev@example.org"), TestContext.Current.CancellationToken);

		var script = commands.Scripts.ShouldHaveSingleItem();
		script.ShouldContain("git add -A -- 'ansible'", Case.Sensitive);
		script.ShouldContain("git -c user.name='Ansible UI' -c user.email='ansible-ui@localhost' commit --quiet --author='Dev User <dev@example.org>' -m 'Fix '\\''dns'\\''\nsecond line'", Case.Sensitive);
		script.ShouldContain("git push --quiet origin 'HEAD:refs/heads/ansible-ui/dev/fix-1234abcd'", Case.Sensitive);
		script.ShouldNotContain("--force");
	}

	[Fact]
	public async Task Rebase_refuses_remote_commits_and_force_pushes_with_lease()
	{
		var commands = new FakeCommands { Result = new RemoteCommandResult("abc\n", "", 0) };

		await Create(commands).RebaseAsync(DraftId, "ansible-ui/dev/fix", TestContext.Current.CancellationToken);

		var script = commands.Scripts.ShouldHaveSingleItem();
		script.ShouldContain("[ -z \"$(git status --porcelain --untracked-files=all)\" ] || exit 9;", Case.Sensitive);
		script.ShouldContain("git merge-base --is-ancestor \"$up\" HEAD || exit 12;", Case.Sensitive);
		script.ShouldContain("rebase --quiet 'refs/remotes/origin/main'", Case.Sensitive);
		script.ShouldContain("git rebase --abort", Case.Sensitive);
		script.ShouldContain("git push --quiet --force-with-lease='refs/heads/ansible-ui/dev/fix:'\"$up\" origin 'HEAD:refs/heads/ansible-ui/dev/fix'", Case.Sensitive);
	}

	[Fact]
	public async Task Brouillon_worktrees_live_outside_the_authoritative_clone_and_are_never_cleaned()
	{
		var commands = new FakeCommands { Result = new RemoteCommandResult("abc\n", "", 0) };
		var workspace = Create(commands);

		await workspace.CreateAsync(DraftId, "ansible-ui/dev/fix", TestContext.Current.CancellationToken);
		await workspace.RemoveAsync(DraftId, "ansible-ui/dev/fix", deleteRemoteBranch: true, TestContext.Current.CancellationToken);

		commands.Scripts[0].ShouldContain("git clone --quiet --bare 'ssh://git@example/ansible.git' '/srv/ansible.drafts/repo.git'", Case.Sensitive);
		commands.Scripts[0].ShouldContain($"worktree add --quiet --no-track -b 'ansible-ui/dev/fix' '{Worktree}' 'refs/remotes/origin/main'", Case.Sensitive);
		commands.Scripts[1].ShouldContain("ls-remote --exit-code origin 'refs/heads/ansible-ui/dev/fix'", Case.Sensitive);
		commands.Scripts.ShouldAllBe(script => !script.Contains("/srv/ansible'") && !script.Contains("git clean"));
	}

	[Fact]
	public async Task Run_worktree_is_a_detached_checkout_of_the_pushed_commit()
	{
		var commands = new FakeCommands();
		var runId = Guid.Parse("0196a1b2-0000-7000-8000-000000000001");
		var revision = new string('c', 40);

		var directory = await Create(commands).PrepareRunAsync(runId, revision, TestContext.Current.CancellationToken);

		directory.ShouldBe("/srv/ansible.drafts/runs/0196a1b2000070008000000000000001/ansible");
		commands.Scripts.ShouldHaveSingleItem().ShouldContain(
			$"worktree add --quiet --detach '/srv/ansible.drafts/runs/0196a1b2000070008000000000000001' '{revision}'", Case.Sensitive);
	}

	[Fact]
	public void Status_parses_counts_renames_and_untracked_files()
	{
		var output =
			"1111111111111111111111111111111111111111\n2222222222222222222222222222222222222222\n3\t2\n1\n\0" +
			"M\0ansible/site.yml\0R087\0ansible/old.yml\0ansible/renamed.yml\0D\0ansible/gone.yml\0M\0README.md\0" +
			"\0:untracked:\0ansible/new.yml\0";

		var status = DraftWorkspace.ParseStatus(output, "ansible");

		status.HeadRevision.ShouldBe(new string('1', 40));
		status.PushedRevision.ShouldBe(new string('2', 40));
		status.Behind.ShouldBe(3);
		status.Ahead.ShouldBe(2);
		status.HasUncommittedChanges.ShouldBeTrue();
		status.Changes.ShouldBe([
			new DraftFileChange("gone.yml", DraftFileChangeKind.Deleted, null),
			new DraftFileChange("new.yml", DraftFileChangeKind.Added, null),
			new DraftFileChange("renamed.yml", DraftFileChangeKind.Renamed, "old.yml"),
			new DraftFileChange("site.yml", DraftFileChangeKind.Modified, null),
		]);
	}

	[Fact]
	public void Status_of_a_never_pushed_branch_has_no_pushed_revision()
	{
		var status = DraftWorkspace.ParseStatus($"{new string('1', 40)}\n-\n0\t0\n0\n\0\0:untracked:\0", "ansible");

		status.PushedRevision.ShouldBeNull();
		status.HasUncommittedChanges.ShouldBeFalse();
		status.Changes.ShouldBeEmpty();
	}

	private static DraftWorkspace Create(FakeCommands commands) => new(commands,
		Options.Create(new GitRepositoryOptions { Path = "/srv/ansible", Url = "ssh://git@example/ansible.git", Branch = "main" }),
		Options.Create(new DraftWorkspaceOptions { Root = "/srv/ansible.drafts", AnsibleDirectory = "ansible" }));

	private sealed class FakeCommands : IRemoteCommandExecutor
	{
		public List<string> Scripts { get; } = [];
		public RemoteCommandResult Result { get; init; } = new("", "", 0);

		public Task<RemoteCommandResult> ExecuteAsync(string script, CancellationToken ct = default)
		{
			Scripts.Add(script);
			return Task.FromResult(Result);
		}

		public Task<RemoteCommandResult> ExecuteStreamingAsync(string script, Func<string, Task> onOutput, CancellationToken ct = default) =>
			throw new NotSupportedException();
	}
}
