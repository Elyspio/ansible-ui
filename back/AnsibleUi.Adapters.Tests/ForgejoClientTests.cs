using System.Net;
using System.Text;
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
