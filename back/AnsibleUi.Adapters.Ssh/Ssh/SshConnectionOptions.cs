using System.ComponentModel.DataAnnotations;

namespace AnsibleUi.Adapters.Ssh.Ssh;

public sealed class SshConnectionOptions
{
	public const string SectionName = "SshConnection";

	[Required(AllowEmptyStrings = false)] public string Host { get; set; } = "";
	[Range(1, 65535)] public int Port { get; set; } = 22;
	[Required(AllowEmptyStrings = false)] public string User { get; set; } = "";
	[Required(AllowEmptyStrings = false)] public string PrivateKeyPath { get; set; } = "";
	public string? PrivateKeyPassphrase { get; set; }
}
