using System.ComponentModel.DataAnnotations;

namespace AnsibleUi.Adapters.Ansible;

public sealed class AnsibleOptions
{
	public const string SectionName = "Ansible";

	[Required(AllowEmptyStrings = false)] public string WorkingDirectory { get; set; } = "";

	/// <summary>
	///     Trust an SSH host key on its first connection, while still rejecting a changed key.
	///     Requires an OpenSSH client that supports StrictHostKeyChecking=accept-new.
	/// </summary>
	public bool AcceptNewSshHostKeys { get; set; }
}
