using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Abstractions.Interfaces;

/// <summary>Executes POSIX shell scripts on the Rebond. Transport failures throw; command failures return their exit code.</summary>
public interface IRemoteCommandExecutor
{
	Task<RemoteCommandResult> ExecuteAsync(string script, CancellationToken ct = default);
	Task<RemoteCommandResult> ExecuteStreamingAsync(string script, Func<string, Task> onOutput, CancellationToken ct = default);
}
