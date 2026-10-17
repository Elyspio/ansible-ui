using AnsibleUi.Abstractions.Exceptions;

namespace AnsibleUi.Abstractions;

/// <summary>Validation of user-supplied paths relative to the Ansible directory.</summary>
public static class RepositoryPath
{
	private const int MaxLength = 1024;

	/// <summary>Rejects absolute paths, traversal, Git metadata and control characters.</summary>
	public static string Validate(string? path)
	{
		if (string.IsNullOrEmpty(path) || path.Length > MaxLength)
			throw HttpException.BadRequest("A file path is required");
		if (path.StartsWith('/') || path.EndsWith('/') || path.Contains('\\') || path.Any(char.IsControl))
			throw HttpException.BadRequest($"Invalid file path '{path}'");
		foreach (var segment in path.Split('/'))
		{
			if (segment is "" or "." or ".." || segment.Equals(".git", StringComparison.OrdinalIgnoreCase))
				throw HttpException.BadRequest($"Invalid file path '{path}'");
		}
		return path;
	}
}
