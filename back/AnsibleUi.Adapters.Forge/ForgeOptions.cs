using System.ComponentModel.DataAnnotations;

namespace AnsibleUi.Adapters.Forge;

/// <summary>Forgejo (or Gitea) hosting the Dépôt Ansible; used for pull requests and commit checks only.</summary>
public sealed class ForgeOptions
{
	public const string SectionName = "Forge";

	/// <summary>Forge web root, e.g. "https://git.example.org".</summary>
	[Required(AllowEmptyStrings = false)] public string BaseUrl { get; set; } = "";

	/// <summary>Access token with read/write permission on the repository's pull requests. Keep it out of source.</summary>
	[Required(AllowEmptyStrings = false)] public string Token { get; set; } = "";

	/// <summary>Repository owner; derived from GitRepository:Url when empty.</summary>
	[Required(AllowEmptyStrings = false)] public string Owner { get; set; } = "";

	/// <summary>Repository name; derived from GitRepository:Url when empty.</summary>
	[Required(AllowEmptyStrings = false)] public string Repository { get; set; } = "";

	/// <summary>Pull request target; always the configured GitRepository:Branch.</summary>
	[Required(AllowEmptyStrings = false)] public string BaseBranch { get; set; } = "";

	/// <summary>Owner and repository from a Git URL ("ssh://git@host:2222/owner/repo.git", "git@host:owner/repo.git", "https://host/owner/repo").</summary>
	public static (string Owner, string Repository)? ParseRepository(string url)
	{
		var path = Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme != "file"
			? uri.AbsolutePath
			: url[(url.IndexOf(':') + 1)..];
		var segments = path.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
		if (segments.Length < 2) return null;
		var repository = segments[^1].EndsWith(".git", StringComparison.Ordinal) ? segments[^1][..^4] : segments[^1];
		return repository.Length == 0 ? null : (segments[^2], repository);
	}
}
