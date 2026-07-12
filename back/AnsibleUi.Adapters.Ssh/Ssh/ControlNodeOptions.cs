using System.ComponentModel.DataAnnotations;

namespace AnsibleUi.Adapters.Ssh.Ssh;

/// <summary>SSH access to the control node. Everything environment-specific lives here — nothing is hardcoded.</summary>
public sealed class ControlNodeOptions
{
	public const string SectionName = "ControlNode";

	[Required(AllowEmptyStrings = false, ErrorMessage = "ControlNode:Host is required")]
	public string Host { get; set; } = "";

	[Range(1, 65535)] public int Port { get; set; } = 22;

	[Required(AllowEmptyStrings = false, ErrorMessage = "ControlNode:User is required")]
	public string User { get; set; } = "";

	/// <summary>Path (inside the backend container/host) to the private key used to reach the control node.</summary>
	[Required(AllowEmptyStrings = false, ErrorMessage = "ControlNode:PrivateKeyPath is required")]
	public string PrivateKeyPath { get; set; } = "";

	public string? PrivateKeyPassphrase { get; set; }

	/// <summary>Path of the Ansible repository clone on the control node.</summary>
	[Required(AllowEmptyStrings = false, ErrorMessage = "ControlNode:RepoPath is required")]
	public string RepoPath { get; set; } = "";

	/// <summary>Git URL reachable from the control node.</summary>
	[Required(AllowEmptyStrings = false, ErrorMessage = "ControlNode:RepositoryUrl is required")]
	public string RepositoryUrl { get; set; } = "";

	/// <summary>Authoritative remote branch mirrored on the control node.</summary>
	[Required(AllowEmptyStrings = false, ErrorMessage = "ControlNode:RepositoryBranch is required")]
	public string RepositoryBranch { get; set; } = "";

	/// <summary>Sub-directory of the repo holding ansible.cfg and playbooks/; empty when the repo root is the Ansible directory.</summary>
	public string AnsibleDirectory { get; set; } = "";

	/// <summary>Full path of the directory where ansible commands run.</summary>
	public string WorkingDirectory => string.IsNullOrEmpty(AnsibleDirectory) ? RepoPath : $"{RepoPath.TrimEnd('/')}/{AnsibleDirectory}";
}
