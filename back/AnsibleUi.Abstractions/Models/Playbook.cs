namespace AnsibleUi.Abstractions.Models;

/// <summary>An executable playbook discovered in the Ansible repository.</summary>
/// <param name="Path">Path relative to the Ansible directory (e.g. "playbooks/databases/setup_redis_cluster.yaml").</param>
/// <param name="Name">File name without extension (e.g. "setup_redis_cluster").</param>
/// <param name="Category">Derived from the sub-folder under playbooks/; "base" for the root.</param>
public sealed record Playbook(string Path, string Name, string Category)
{
	public static Playbook FromPath(string path)
	{
		var segments = path.Split('/');
		return new Playbook(path, System.IO.Path.GetFileNameWithoutExtension(segments[^1]), segments.Length > 2 ? segments[^2] : "base");
	}

	public static bool IsPlaybookPath(string path) =>
		path.StartsWith("playbooks/", StringComparison.Ordinal) &&
		(path.EndsWith(".yml", StringComparison.Ordinal) || path.EndsWith(".yaml", StringComparison.Ordinal));
}
