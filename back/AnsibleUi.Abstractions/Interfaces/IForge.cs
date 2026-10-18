using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Abstractions.Interfaces;

/// <summary>Pull requests and commit checks of the Dépôt Ansible on its forge.</summary>
public interface IForge
{
	/// <summary>Opens a pull request from <paramref name="branch" /> to the reference branch, or returns the open one.</summary>
	Task<PullRequest> OpenPullRequestAsync(string branch, string title, string body, CancellationToken ct = default);

	Task<PullRequest?> GetPullRequestAsync(int number, CancellationToken ct = default);
	Task ClosePullRequestAsync(int number, CancellationToken ct = default);
	/// <summary>Squashes the expected Brouillon commit into the configured reference branch, respecting forge protections.</summary>
	Task SquashPullRequestAsync(int number, string branch, string expectedRevision, CancellationToken ct = default);
	Task<CommitChecks> GetChecksAsync(string revision, CancellationToken ct = default);
}
