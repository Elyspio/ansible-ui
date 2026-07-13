using System.ComponentModel.DataAnnotations;

namespace AnsibleUi.Adapters.Git;

public sealed class GitRepositoryOptions
{
	public const string SectionName = "GitRepository";

	[Required(AllowEmptyStrings = false)] public string Path { get; set; } = "";
	[Required(AllowEmptyStrings = false)] public string Url { get; set; } = "";
	[Required(AllowEmptyStrings = false)] public string Branch { get; set; } = "";
}
