using System.Security.Claims;
using AnsibleUi.Web.Auth;

namespace AnsibleUi.E2E;

public sealed class UserClaimsTests
{
	[Fact]
	public void Editor_role_is_read_from_keycloak_realm_and_client_roles()
	{
		var realm = Principal(new Claim("realm_access", """{"roles":["offline_access","ansible-ui-editor"]}""", "JSON"));
		var client = Principal(new Claim("resource_access", """{"ansible-ui":{"roles":["ansible-ui-editor"]},"other":{"roles":["x"]}}""", "JSON"));
		var mapped = Principal(new Claim(ClaimTypes.Role, "ansible-ui-editor"));

		UserClaims.Roles(realm, "ansible-ui").ShouldContain("ansible-ui-editor");
		UserClaims.Roles(client, "ansible-ui").ShouldBe(["ansible-ui-editor"]);
		UserClaims.Roles(mapped, "ansible-ui").ShouldContain("ansible-ui-editor");
	}

	[Fact]
	public void Roles_of_another_client_do_not_grant_editing()
	{
		var user = Principal(new Claim("resource_access", """{"other":{"roles":["ansible-ui-editor"]}}""", "JSON"));

		UserClaims.Roles(user, "ansible-ui").ShouldBeEmpty();
	}

	private static ClaimsPrincipal Principal(params Claim[] claims) => new(new ClaimsIdentity(claims, "test"));
}
