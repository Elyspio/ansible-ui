using System.ComponentModel.DataAnnotations;

namespace AnsibleUi.Web.Auth;

/// <summary>Generic OIDC bearer validation configuration.</summary>
public sealed class AuthOptions
{
	public const string SectionName = "Auth";

	[Required] public string Authority { get; set; } = "";

	[Required] public string Audience { get; set; } = "";
}
