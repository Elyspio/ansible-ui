using System.ComponentModel.DataAnnotations;

namespace AnsibleUi.Adapters.Git;

public sealed class DraftWorkspaceOptions
{
	public const string SectionName = "Drafts";

	/// <summary>
	///     Absolute POSIX directory on the Rebond holding the Brouillon clone and worktrees.
	///     Defaults to "&lt;GitRepository:Path&gt;.drafts"; must not overlap the authoritative clone.
	/// </summary>
	public string Root { get; set; } = "";

	/// <summary>Ansible directory relative to the repository root ("" for the root). Derived from Ansible:WorkingDirectory.</summary>
	public string AnsibleDirectory { get; set; } = "";

	/// <summary>Committer identity on the Rebond; the author of each commit is the signed-in user.</summary>
	[Required(AllowEmptyStrings = false)] public string CommitterName { get; set; } = "Ansible UI";

	[Required(AllowEmptyStrings = false)] public string CommitterEmail { get; set; } = "ansible-ui@localhost";
}
