using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using Microsoft.Extensions.Options;

namespace AnsibleUi.Adapters.Forge;

/// <summary>Forgejo / Gitea REST API v1 client. The named HttpClient carries base address and token.</summary>
public sealed class ForgejoClient(IHttpClientFactory clients, IOptions<ForgeOptions> options) : IForge
{
	public const string ClientName = "forge";

	private readonly ForgeOptions _options = options.Value;

	// Singleton consumers: create clients per call so the factory keeps rotating handlers.
	private HttpClient Http => clients.CreateClient(ClientName);

	private string Repo => $"repos/{Uri.EscapeDataString(_options.Owner)}/{Uri.EscapeDataString(_options.Repository)}";

	public async Task<PullRequest> OpenPullRequestAsync(string branch, string title, string body, CancellationToken ct = default)
	{
		// Look up first: a retried request or an earlier failure after creation must not open a duplicate.
		if (await FindOpenAsync(branch, ct) is { } existing) return existing;

		using var response = await Http.PostAsJsonAsync($"{Repo}/pulls",
			new CreatePullRequest(branch, _options.BaseBranch, title, body), ct);
		if (response.StatusCode == HttpStatusCode.Conflict && await FindOpenAsync(branch, ct) is { } created)
			return created;
		await EnsureSuccessAsync(response, "open the pull request", ct);
		return Map((await response.Content.ReadFromJsonAsync<PullRequestDto>(ct))!);
	}

	public async Task<PullRequest?> GetPullRequestAsync(int number, CancellationToken ct = default)
	{
		using var response = await Http.GetAsync($"{Repo}/pulls/{number}", ct);
		if (response.StatusCode == HttpStatusCode.NotFound) return null;
		await EnsureSuccessAsync(response, $"read pull request #{number}", ct);
		return Map((await response.Content.ReadFromJsonAsync<PullRequestDto>(ct))!);
	}

	public async Task ClosePullRequestAsync(int number, CancellationToken ct = default)
	{
		using var response = await Http.PatchAsJsonAsync($"{Repo}/pulls/{number}", new { state = "closed" }, ct);
		if (response.StatusCode == HttpStatusCode.NotFound) return;
		await EnsureSuccessAsync(response, $"close pull request #{number}", ct);
	}

	public async Task<CommitChecks> GetChecksAsync(string revision, CancellationToken ct = default)
	{
		using var response = await Http.GetAsync($"{Repo}/commits/{Uri.EscapeDataString(revision)}/status", ct);
		if (response.StatusCode == HttpStatusCode.NotFound) return new CommitChecks(CommitCheckState.None, null);
		await EnsureSuccessAsync(response, "read commit checks", ct);
		var status = (await response.Content.ReadFromJsonAsync<CombinedStatusDto>(ct))!;
		if (status.Statuses is not { Count: > 0 }) return new CommitChecks(CommitCheckState.None, null);

		var state = status.State switch
		{
			"success" => CommitCheckState.Success,
			"pending" => CommitCheckState.Pending,
			"failure" or "error" or "warning" => CommitCheckState.Failure,
			_ => CommitCheckState.None
		};
		var target = status.Statuses.FirstOrDefault(check => check.Status != "success")?.TargetUrl ?? status.Statuses[0].TargetUrl;
		return new CommitChecks(state, string.IsNullOrWhiteSpace(target) ? null : target);
	}

	private async Task<PullRequest?> FindOpenAsync(string branch, CancellationToken ct)
	{
		const int pageSize = 50;
		for (var page = 1; ; page++)
		{
			var pulls = await Http.GetFromJsonAsync<List<PullRequestDto>>(
				$"{Repo}/pulls?state=open&limit={pageSize}&page={page}", ct) ?? [];
			var match = pulls.FirstOrDefault(pull => pull.Head?.Ref == branch && pull.Base?.Ref == _options.BaseBranch);
			if (match is not null) return Map(match);
			if (pulls.Count < pageSize) return null;
		}
	}

	private static PullRequest Map(PullRequestDto pull) => new(
		pull.Number,
		pull.HtmlUrl,
		pull.Merged ? PullRequestState.Merged : pull.State == "closed" ? PullRequestState.Closed : PullRequestState.Open);

	private static async Task EnsureSuccessAsync(HttpResponseMessage response, string action, CancellationToken ct)
	{
		if (response.IsSuccessStatusCode) return;
		var body = await response.Content.ReadAsStringAsync(ct);
		throw HttpException.BadGateway(
			$"Forge refused to {action} ({(int)response.StatusCode}): {body[..Math.Min(body.Length, 300)]}");
	}

	private sealed record CreatePullRequest(
		[property: JsonPropertyName("head")] string Head,
		[property: JsonPropertyName("base")] string Base,
		[property: JsonPropertyName("title")] string Title,
		[property: JsonPropertyName("body")] string Body);

	private sealed record PullRequestDto(
		[property: JsonPropertyName("number")] int Number,
		[property: JsonPropertyName("html_url")] string HtmlUrl,
		[property: JsonPropertyName("state")] string State,
		[property: JsonPropertyName("merged")] bool Merged,
		[property: JsonPropertyName("head")] BranchDto? Head,
		[property: JsonPropertyName("base")] BranchDto? Base);

	private sealed record BranchDto([property: JsonPropertyName("ref")] string Ref);

	private sealed record CombinedStatusDto(
		[property: JsonPropertyName("state")] string? State,
		[property: JsonPropertyName("statuses")] List<StatusDto>? Statuses);

	private sealed record StatusDto(
		[property: JsonPropertyName("status")] string? Status,
		[property: JsonPropertyName("target_url")] string? TargetUrl);
}
