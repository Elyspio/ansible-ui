using System.Net;
using System.Text;
using System.Text.Json;
using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Models;
using AnsibleUi.Adapters.Forge;
using Microsoft.Extensions.Options;
using Shouldly;
using Xunit;

namespace AnsibleUi.Adapters.Tests;

public sealed class ForgejoClientTests
{
	[Theory]
	[InlineData("ssh://git@git.example:2222/elyspio/infrastructure.git", "elyspio", "infrastructure")]
	[InlineData("git@git.example:team/ansible.git", "team", "ansible")]
	[InlineData("https://git.example/team/ansible", "team", "ansible")]
	public void Repository_is_derived_from_the_git_url(string url, string owner, string repository)
	{
		ForgeOptions.ParseRepository(url).ShouldBe((owner, repository));
	}

	[Fact]
	public async Task Open_pull_request_reuses_the_open_one_for_the_branch()
	{
		var handler = new FakeHandler(request => request.Method == HttpMethod.Get
			? Json("""[{"number":7,"html_url":"https://git.example/team/ansible/pulls/7","state":"open","merged":false,"head":{"ref":"ansible-ui/dev/fix"},"base":{"ref":"main"}}]""")
			: throw new InvalidOperationException("must not create a second pull request"));

		var pull = await Create(handler).OpenPullRequestAsync("ansible-ui/dev/fix", "Fix", "", TestContext.Current.CancellationToken);

		pull.ShouldBe(new PullRequest(7, "https://git.example/team/ansible/pulls/7", PullRequestState.Open));
		handler.Requests.ShouldHaveSingleItem().RequestUri!.ToString()
			.ShouldBe("https://git.example/api/v1/repos/team/ansible/pulls?state=open&limit=50&page=1");
	}

	[Fact]
	public async Task Merged_pull_request_is_reported_as_merged()
	{
		var handler = new FakeHandler(_ => Json("""{"number":7,"html_url":"u","state":"closed","merged":true}"""));

		var pull = await Create(handler).GetPullRequestAsync(7, TestContext.Current.CancellationToken);

		pull!.State.ShouldBe(PullRequestState.Merged);
	}

	[Fact]
	public async Task Failed_check_points_at_the_failing_status()
	{
		var handler = new FakeHandler(_ => Json("""{"state":"failure","statuses":[{"status":"success","target_url":"ok"},{"status":"failure","target_url":"https://ci/1"}]}"""));

		var checks = await Create(handler).GetChecksAsync(new string('a', 40), TestContext.Current.CancellationToken);

		checks.ShouldBe(new CommitChecks(CommitCheckState.Failure, "https://ci/1"));
	}

	private static ForgejoClient Create(FakeHandler handler) => new(new FakeFactory(handler),
		Options.Create(new ForgeOptions { BaseUrl = "https://git.example", Token = "t", Owner = "team", Repository = "ansible", BaseBranch = "main" }));

	[Fact]
	public async Task Squash_pins_the_head_commit_and_does_not_bypass_protections_or_queue_a_merge()
	{
		var handler = new FakeHandler(request => request.Method == HttpMethod.Get
			? Json("""{"number":7,"state":"open","merged":false,"head":{"ref":"ansible-ui/dev/fix","sha":"abc"},"base":{"ref":"main"}}""")
			: new HttpResponseMessage(HttpStatusCode.OK));

		await Create(handler).SquashPullRequestAsync(7, "ansible-ui/dev/fix", "abc", TestContext.Current.CancellationToken);

		handler.Requests.Count.ShouldBe(2);
		var request = handler.Requests[1];
		request.Method.ShouldBe(HttpMethod.Post);
		request.RequestUri!.AbsolutePath.ShouldBe("/api/v1/repos/team/ansible/pulls/7/merge");
		using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(TestContext.Current.CancellationToken));
		body.RootElement.GetProperty("Do").GetString().ShouldBe("squash");
		body.RootElement.GetProperty("head_commit_id").GetString().ShouldBe("abc");
		body.RootElement.GetProperty("force_merge").GetBoolean().ShouldBeFalse();
		body.RootElement.GetProperty("merge_when_checks_succeed").GetBoolean().ShouldBeFalse();
		body.RootElement.GetProperty("delete_branch_after_merge").GetBoolean().ShouldBeFalse();
	}

	[Theory]
	[InlineData("different-branch", "main", "abc", "open")]
	[InlineData("ansible-ui/dev/fix", "different-target", "abc", "open")]
	[InlineData("ansible-ui/dev/fix", "main", "different-commit", "open")]
	[InlineData("ansible-ui/dev/fix", "main", "abc", "closed")]
	public async Task Squash_refuses_a_changed_pull_request(string branch, string target, string revision, string state)
	{
		var handler = new FakeHandler(_ => Json(JsonSerializer.Serialize(new
		{
			number = 7, state, merged = false, head = new { @ref = branch, sha = revision }, @base = new { @ref = target }
		})));

		var error = await Should.ThrowAsync<HttpException>(() => Create(handler).SquashPullRequestAsync(7, "ansible-ui/dev/fix", "abc", TestContext.Current.CancellationToken));

		error.StatusCode.ShouldBe(409);
		handler.Requests.ShouldHaveSingleItem();
	}

	[Theory]
	[InlineData(HttpStatusCode.Conflict)]
	[InlineData(HttpStatusCode.MethodNotAllowed)]
	public async Task Squash_surfaces_forge_merge_refusals(HttpStatusCode status)
	{
		var handler = new FakeHandler(request => request.Method == HttpMethod.Get
			? Json("""{"number":7,"state":"open","merged":false,"head":{"ref":"ansible-ui/dev/fix","sha":"abc"},"base":{"ref":"main"}}""")
			: new HttpResponseMessage(status));

		var error = await Should.ThrowAsync<HttpException>(() => Create(handler).SquashPullRequestAsync(7, "ansible-ui/dev/fix", "abc", TestContext.Current.CancellationToken));

		error.StatusCode.ShouldBe(409);
	}

	[Fact]
	public async Task Squash_retry_accepts_a_previously_merged_expected_commit_without_merging_again()
	{
		var handler = new FakeHandler(_ => Json("""{"number":7,"state":"closed","merged":true,"head":{"ref":"ansible-ui/dev/fix","sha":"abc"},"base":{"ref":"main"}}"""));

		await Create(handler).SquashPullRequestAsync(7, "ansible-ui/dev/fix", "abc", TestContext.Current.CancellationToken);

		handler.Requests.ShouldHaveSingleItem().Method.ShouldBe(HttpMethod.Get);
	}

	private static HttpResponseMessage Json(string body) =>
		new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

	private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
	{
		public List<HttpRequestMessage> Requests { get; } = [];

		protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
		{
			Requests.Add(request);
			return Task.FromResult(respond(request));
		}
	}

	private sealed class FakeFactory(HttpMessageHandler handler) : IHttpClientFactory
	{
		public HttpClient CreateClient(string name) =>
			new(handler, disposeHandler: false) { BaseAddress = new Uri("https://git.example/api/v1/") };
	}
}
