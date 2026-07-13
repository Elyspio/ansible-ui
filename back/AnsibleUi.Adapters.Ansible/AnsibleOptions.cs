using System.ComponentModel.DataAnnotations;

namespace AnsibleUi.Adapters.Ansible;

public sealed class AnsibleOptions
{
	public const string SectionName = "Ansible";

	[Required(AllowEmptyStrings = false)] public string WorkingDirectory { get; set; } = "";
}
