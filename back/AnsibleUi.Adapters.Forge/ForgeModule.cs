using System.Net.Http.Headers;
using AnsibleUi.Abstractions.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace AnsibleUi.Adapters.Forge;

public static class ForgeModule
{
	public static IServiceCollection AddAnsibleUiForge(this IServiceCollection services, IConfiguration config)
	{
		services.AddOptions<ForgeOptions>()
			.Bind(config.GetSection(ForgeOptions.SectionName))
			.ValidateDataAnnotations()
			.Validate(options => IsHttpUrl(options.BaseUrl), "Forge:BaseUrl must be an absolute HTTP(S) URL")
			.ValidateOnStart();
		services.AddHttpClient(ForgejoClient.ClientName, (provider, http) =>
		{
			var options = provider.GetRequiredService<IOptions<ForgeOptions>>().Value;
			http.BaseAddress = new Uri($"{options.BaseUrl.TrimEnd('/')}/api/v1/");
			http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", options.Token);
			http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
		});
		services.AddSingleton<IForge, ForgejoClient>();
		return services;
	}

	private static bool IsHttpUrl(string url) =>
		Uri.TryCreate(url, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}
