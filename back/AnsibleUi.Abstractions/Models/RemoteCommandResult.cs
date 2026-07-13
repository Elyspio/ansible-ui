namespace AnsibleUi.Abstractions.Models;

/// <summary>Result of a command executed on the Rebond.</summary>
public sealed record RemoteCommandResult(string StandardOutput, string StandardError, int ExitCode)
{
	public bool Succeeded => ExitCode == 0;
}
