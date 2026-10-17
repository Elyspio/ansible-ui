using System.ComponentModel.DataAnnotations;

namespace AnsibleUi.Web.Auth;

/// <summary>Generic OIDC bearer validation configuration.</summary>
public sealed class AuthOptions
{
	public const string SectionName = "Auth";

	[Required] public string Authority { get; set; } = "";

	[Required] public string Audience { get; set; } = "";

	/// <summary>Role allowing Brouillons: editing, pushing and running unmerged code on managed hosts.</summary>
	[Required(AllowEmptyStrings = false)] public string EditorRole { get; set; } = "ansible-ui-editor";
}
