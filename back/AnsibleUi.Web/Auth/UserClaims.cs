using System.Security.Claims;
using System.Text.Json;
using AnsibleUi.Core.Services;

namespace AnsibleUi.Web.Auth;

public static class UserClaims
{
	public static string Name(ClaimsPrincipal user) =>
		user.FindFirst("name")?.Value ?? user.Identity?.Name ?? user.FindFirst("preferred_username")?.Value ?? "unknown";

	public static DraftUser DraftUser(ClaimsPrincipal user)
	{
		var login = user.FindFirst("preferred_username")?.Value ?? Name(user);
		// JwtBearer maps "email" and "roles" to their ClaimTypes URIs unless MapInboundClaims is off.
		var email = user.FindFirst("email")?.Value ?? user.FindFirst(ClaimTypes.Email)?.Value;
		return new DraftUser(login, Name(user), string.IsNullOrWhiteSpace(email) ? $"{login}@users.noreply.ansible-ui" : email);
	}

	/// <summary>
	///     Roles from a plain "roles" claim or Keycloak's "realm_access.roles" and
	///     "resource_access.&lt;audience&gt;.roles" JSON claims.
	/// </summary>
	public static IReadOnlySet<string> Roles(ClaimsPrincipal user, string audience)
	{
		var roles = new HashSet<string>(StringComparer.Ordinal);
		foreach (var claim in user.FindAll(claim => claim.Type is "roles" or ClaimTypes.Role)) roles.UnionWith(ReadRoles(claim.Value));
		foreach (var claim in user.FindAll("realm_access")) roles.UnionWith(ReadObjectRoles(claim.Value));
		foreach (var claim in user.FindAll("resource_access"))
		{
			try
			{
				using var json = JsonDocument.Parse(claim.Value);
				if (json.RootElement.ValueKind == JsonValueKind.Object && json.RootElement.TryGetProperty(audience, out var client))
					roles.UnionWith(ReadObjectRoles(client.GetRawText()));
			}
			catch (JsonException)
			{
				// Not a Keycloak claim shape; ignore.
			}
		}
		return roles;
	}

	private static IEnumerable<string> ReadObjectRoles(string json)
	{
		try
		{
			using var document = JsonDocument.Parse(json);
			if (document.RootElement.ValueKind != JsonValueKind.Object ||
			    !document.RootElement.TryGetProperty("roles", out var roles) ||
			    roles.ValueKind != JsonValueKind.Array)
				return [];
			return roles.EnumerateArray().Where(role => role.ValueKind == JsonValueKind.String).Select(role => role.GetString()!).ToList();
		}
		catch (JsonException)
		{
			return [];
		}
	}

	/// <summary>A "roles" claim is either one role per claim or a JSON array.</summary>
	private static IEnumerable<string> ReadRoles(string value)
	{
		if (!value.StartsWith('[')) return [value];
		try
		{
			return JsonSerializer.Deserialize<string[]>(value) ?? [];
		}
		catch (JsonException)
		{
			return [];
		}
	}
}
