namespace AnsibleUi.Abstractions.Models;

/// <summary>A single execution of a playbook, from submission to terminal state.</summary>
public sealed class Run
{
	public Guid Id { get; init; } = Guid.CreateVersion7();

	/// <summary>Playbook path relative to the Ansible directory (e.g. "playbooks/network/deploy_haproxy.yaml").</summary>
	public required string Playbook { get; init; }

	public required RunOptions Options { get; init; }

	public RunStatus Status { get; set; } = RunStatus.Queued;

	/// <summary>User (claim "name") who submitted the run.</summary>
	public required string RequestedBy { get; init; }

	public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
	public DateTime? StartedAt { get; set; }
	public DateTime? FinishedAt { get; set; }

	/// <summary>ansible-playbook exit code; null until finished (or unknown for Interrupted).</summary>
	public int? ExitCode { get; set; }

	/// <summary>Full raw output (ANSI), stored as appended chunks.</summary>
	public List<string> Output { get; set; } = [];

	/// <summary>Per-host summary parsed from the final PLAY RECAP; empty until finished.</summary>
	public List<HostRecap> Recap { get; set; } = [];
}

/// <summary>Launch options — the only knobs exposed in v1.</summary>
public sealed record RunOptions
{
	/// <summary>--limit target (host/group patterns); null or empty = whole inventory.</summary>
	public string? Limit { get; init; }

	public bool Check { get; init; }
	public bool Diff { get; init; }
}

public enum RunStatus
{
	Queued,
	Running,
	Succeeded,
	Failed,
	Canceled,
	Interrupted
}

/// <summary>One host line of the PLAY RECAP.</summary>
public sealed record HostRecap(string Host, int Ok, int Changed, int Unreachable, int Failed, int Skipped);
