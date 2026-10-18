using System.Security.Claims;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using AnsibleUi.Core.Services;
using AnsibleUi.Web.Auth;
using AnsibleUi.Web.Controllers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace AnsibleUi.E2E;

public sealed class RunRepeatTests
{
	[Theory]
	[InlineData(false)]
	[InlineData(true)]
	public async Task Repeat_submits_saved_settings_with_a_new_identity_and_empty_results(bool draftRun)
	{
		var source = Original(draftRun);
		var repository = new FakeRepository(source);
		var notifier = new FakeNotifier();
		var authorization = new FakeAuthorization(draftRun);
		using var services = new ServiceCollection().AddSingleton<IRunRepository>(repository)
			.AddSingleton<IRealtimeNotifier>(notifier).BuildServiceProvider();
		using var launcher = new RunLauncher(services, NullLogger<RunLauncher>.Instance);
		var controller = Controller(repository, launcher, authorization);

		var result = (await controller.Repeat(source.Id, TestContext.Current.CancellationToken)).ShouldBeOfType<CreatedAtActionResult>();
		var repeated = result.Value.ShouldBeOfType<Run>();

		repeated.Id.ShouldNotBe(source.Id);
		repeated.Playbook.ShouldBe(source.Playbook);
		repeated.Options.ShouldBe(source.Options);
		repeated.Draft.ShouldBe(source.Draft);
		repeated.RequestedBy.ShouldBe("Current User");
		repeated.Status.ShouldBe(RunStatus.Queued);
		repeated.StartedAt.ShouldBeNull();
		repeated.FinishedAt.ShouldBeNull();
		repeated.ExitCode.ShouldBeNull();
		repeated.Output.ShouldBeEmpty();
		repeated.Recap.ShouldBeEmpty();
		repository.Inserted.ShouldHaveSingleItem().ShouldBeSameAs(repeated);
		notifier.Changed.ShouldHaveSingleItem().ShouldBeSameAs(repeated);
		source.Status.ShouldBe(RunStatus.Failed);
		source.Output.ShouldBe(["original log"]);
		authorization.Policies.ShouldBe(draftRun ? [AuthPolicies.Editor] : []);
	}

	[Fact]
	public async Task Repeat_of_a_draft_requires_the_editor_policy_before_queueing()
	{
		var source = Original(draftRun: true);
		var repository = new FakeRepository(source);
		using var services = new ServiceCollection().BuildServiceProvider();
		using var launcher = new RunLauncher(services, NullLogger<RunLauncher>.Instance);
		var authorization = new FakeAuthorization(false);

		(await Controller(repository, launcher, authorization).Repeat(source.Id, TestContext.Current.CancellationToken)).ShouldBeOfType<ForbidResult>();

		repository.Inserted.ShouldBeEmpty();
		authorization.Policies.ShouldBe([AuthPolicies.Editor]);
	}

	[Fact]
	public async Task Repeat_of_a_missing_run_returns_not_found()
	{
		var repository = new FakeRepository(null);
		using var services = new ServiceCollection().BuildServiceProvider();
		using var launcher = new RunLauncher(services, NullLogger<RunLauncher>.Instance);

		(await Controller(repository, launcher, new FakeAuthorization(false)).Repeat(Guid.NewGuid(), TestContext.Current.CancellationToken)).ShouldBeOfType<NotFoundResult>();

		repository.Inserted.ShouldBeEmpty();
	}

	private static RunsController Controller(IRunRepository repository, RunLauncher launcher, IAuthorizationService authorization) =>
		new(repository, launcher, authorization)
		{
			ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext
			{
				User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("name", "Current User")], "test"))
			} }
		};

	private static Run Original(bool draftRun) => new()
	{
		Playbook = "playbooks/web.yml",
		Options = new RunOptions { Limit = "web:&prod:!maintenance", Check = true, Diff = true },
		RequestedBy = "Original User",
		Draft = draftRun ? new DraftRunSource(Guid.NewGuid(), "Old draft", "ansible-ui/dev/old", new string('a', 40), "https://git.example/pulls/7") : null,
		Status = RunStatus.Failed,
		StartedAt = DateTime.UtcNow.AddHours(-1),
		FinishedAt = DateTime.UtcNow,
		ExitCode = 2,
		Output = ["original log"],
		Recap = [new HostRecap("web-1", 1, 0, 0, 1, 0)]
	};

	private sealed class FakeAuthorization(bool allowed) : IAuthorizationService
	{
		public List<string> Policies { get; } = [];
		public Task<AuthorizationResult> AuthorizeAsync(ClaimsPrincipal user, object? resource, string policyName)
		{
			Policies.Add(policyName);
			return Task.FromResult(allowed ? AuthorizationResult.Success() : AuthorizationResult.Failed());
		}
		public Task<AuthorizationResult> AuthorizeAsync(ClaimsPrincipal user, object? resource, IEnumerable<IAuthorizationRequirement> requirements) => throw new NotSupportedException();
	}

	private sealed class FakeRepository(Run? source) : IRunRepository
	{
		public List<Run> Inserted { get; } = [];
		public Task<Run?> GetAsync(Guid id, CancellationToken ct = default) => Task.FromResult(source?.Id == id ? source : null);
		public Task InsertAsync(Run run, CancellationToken ct = default) { Inserted.Add(run); return Task.CompletedTask; }
		public Task<IReadOnlyList<Run>> ListAsync(int skip, int take, CancellationToken ct = default) => throw new NotSupportedException();
		public Task SetStatusAsync(Guid id, RunStatus status, DateTime? startedAt = null, DateTime? finishedAt = null, int? exitCode = null, CancellationToken ct = default) => throw new NotSupportedException();
		public Task AppendOutputAsync(Guid id, string chunk, CancellationToken ct = default) => throw new NotSupportedException();
		public Task SetRecapAsync(Guid id, IReadOnlyList<HostRecap> recap, CancellationToken ct = default) => throw new NotSupportedException();
		public Task<long> MarkRunningAsInterruptedAsync(CancellationToken ct = default) => throw new NotSupportedException();
		public Task<IReadOnlyList<Run>> ListQueuedAsync(CancellationToken ct = default) => throw new NotSupportedException();
	}

	private sealed class FakeNotifier : IRealtimeNotifier
	{
		public List<Run> Changed { get; } = [];
		public Task RunChangedAsync(Run run) { Changed.Add(run); return Task.CompletedTask; }
		public Task RunOutputAsync(Guid runId, string chunk) => throw new NotSupportedException();
		public Task RepositoryChangedAsync(RepositoryStatus status) => throw new NotSupportedException();
		public Task RepositoryStatusChangedAsync(RepositoryStatus status) => throw new NotSupportedException();
		public Task DraftChangedAsync(Draft draft) => throw new NotSupportedException();
	}
}
