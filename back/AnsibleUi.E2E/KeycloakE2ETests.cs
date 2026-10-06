using System.Net;
using Aspire.Hosting.Testing;
using Microsoft.Playwright;
using static Microsoft.Playwright.Assertions;

namespace AnsibleUi.E2E;

[CollectionDefinition(nameof(KeycloakE2ECollection), DisableParallelization = true)]
public sealed class KeycloakE2ECollection;

[Collection(nameof(KeycloakE2ECollection))]
public sealed class KeycloakE2ETests
{
	[Fact]
	public async Task UserCanSignInWithLocalKeycloakAndReadRunHistory()
	{
		var ct = TestContext.Current.CancellationToken;
		var appHost = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AnsibleUi_AppHost>(["--E2E=true"], ct);
		await using var app = await appHost.BuildAsync(ct);
		await app.StartAsync(ct);

		await app.ResourceNotifications.WaitForResourceHealthyAsync("api", ct).WaitAsync(TimeSpan.FromMinutes(2), ct);
		using var api = app.CreateHttpClient("api");
		var unauthorized = await api.GetAsync("/api/runs", ct);
		unauthorized.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);

		await app.ResourceNotifications.WaitForResourceHealthyAsync("front", ct).WaitAsync(TimeSpan.FromMinutes(2), ct);
		using var front = app.CreateHttpClient("front");
		var frontUrl = front.BaseAddress ?? throw new InvalidOperationException("Front endpoint unavailable.");

		using var playwright = await Playwright.CreateAsync();
		await using var browser = await playwright.Chromium.LaunchAsync(new BrowserTypeLaunchOptions { Headless = true });
		var page = await browser.NewPageAsync(new BrowserNewPageOptions { IgnoreHTTPSErrors = true });
		await page.GotoAsync(frontUrl.ToString());

		await page.Locator("#username").FillAsync("dev");
		await page.Locator("#password").FillAsync("dev");
		await page.Locator("#kc-login").ClickAsync();

		await Expect(page.GetByText("Dev User", new PageGetByTextOptions { Exact = true })).ToBeVisibleAsync();
		await page.GetByRole(AriaRole.Link, new PageGetByRoleOptions { Name = "History" }).ClickAsync();
		await Expect(page.GetByRole(AriaRole.Heading, new PageGetByRoleOptions { Name = "History" })).ToBeVisibleAsync();
		await Expect(page.GetByText("No runs yet", new PageGetByTextOptions { Exact = true })).ToBeVisibleAsync();
	}
}
