using AnsibleUi.Web.Auth;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace AnsibleUi.E2E;

public sealed class AuthConfigurationTests
{
	[Fact]
	public async Task MissingAuthority_PreventsApplicationStartup()
	{
		var ct = TestContext.Current.CancellationToken;
		using var host = CreateHost([
			new KeyValuePair<string, string?>("Auth:Audience", "ansible-ui"),
		]);

		var error = await Assert.ThrowsAsync<OptionsValidationException>(() => host.StartAsync(ct));

		Assert.Contains("Authority", error.Message);
	}

	[Fact]
	public async Task InvalidAuthority_PreventsApplicationStartup()
	{
		var ct = TestContext.Current.CancellationToken;
		using var host = CreateHost([
			new KeyValuePair<string, string?>("Auth:Authority", "keycloak/realms/ansible-ui"),
			new KeyValuePair<string, string?>("Auth:Audience", "ansible-ui"),
		]);

		var error = await Assert.ThrowsAsync<OptionsValidationException>(() => host.StartAsync(ct));

		Assert.Contains("HTTP(S)", error.Message);
	}

	[Fact]
	public async Task ValidAuthorityAndAudience_AllowApplicationStartup()
	{
		var ct = TestContext.Current.CancellationToken;
		using var host = CreateHost([
			new KeyValuePair<string, string?>("Auth:Authority", "http://localhost:8080/realms/ansible-ui"),
			new KeyValuePair<string, string?>("Auth:Audience", "ansible-ui"),
		]);

		await host.StartAsync(ct);
		await host.StopAsync(ct);
	}

	private static IHost CreateHost(IEnumerable<KeyValuePair<string, string?>> settings)
	{
		var builder = Host.CreateApplicationBuilder();
		builder.Configuration.AddInMemoryCollection(settings);
		builder.Services.AddAnsibleUiAuth(builder.Configuration);
		return builder.Build();
	}
}
