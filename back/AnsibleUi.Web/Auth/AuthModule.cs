using Microsoft.AspNetCore.Authentication.JwtBearer;

namespace AnsibleUi.Web.Auth;

public static class AuthModule
{
	public static IServiceCollection AddAnsibleUiAuth(this IServiceCollection services, IConfiguration config)
	{
		var auth = new AuthOptions();
		config.GetSection(AuthOptions.SectionName).Bind(auth);

		services.AddOptions<AuthOptions>()
			.Bind(config.GetSection(AuthOptions.SectionName))
			.ValidateDataAnnotations()
			.Validate(options => IsHttpAuthority(options.Authority), "Auth:Authority must be an absolute HTTP(S) URL.")
			.ValidateOnStart();

		services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
			.AddJwtBearer(options =>
			{
				options.Authority = auth.Authority;
				options.Audience = auth.Audience;
				// Local dev (http Keycloak) serves metadata over http; production authorities are https.
				options.RequireHttpsMetadata = auth.Authority.StartsWith("https", StringComparison.OrdinalIgnoreCase);
				options.TokenValidationParameters.NameClaimType = "name";
				// SignalR: the browser passes the token as a query string on /hubs routes.
				options.Events = new JwtBearerEvents
				{
					OnMessageReceived = context =>
					{
						var accessToken = context.Request.Query["access_token"];
						if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
							context.Token = accessToken;
						return Task.CompletedTask;
					}
				};
			});

		services.AddAuthorization();
		return services;
	}

	private static bool IsHttpAuthority(string authority)
	{
		return Uri.TryCreate(authority, UriKind.Absolute, out var uri) &&
		       (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
	}
}
