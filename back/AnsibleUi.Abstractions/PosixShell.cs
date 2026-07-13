namespace AnsibleUi.Abstractions;

/// <summary>POSIX single-quote escaping for values embedded in shell scripts.</summary>
public static class PosixShell
{
	public static bool IsAbsolute(string path) => path.StartsWith('/');

	public static string NormalizeAbsolute(string path)
	{
		if (!IsAbsolute(path)) throw new ArgumentException("POSIX path must be absolute", nameof(path));
		var segments = new Stack<string>();
		foreach (var segment in path.Split('/', StringSplitOptions.RemoveEmptyEntries))
		{
			if (segment == ".") continue;
			if (segment == "..")
			{
				if (segments.Count > 0) segments.Pop();
				continue;
			}
			segments.Push(segment);
		}
		return "/" + string.Join('/', segments.Reverse());
	}

	public static bool IsContainedIn(string path, string parent)
	{
		if (!IsAbsolute(path) || !IsAbsolute(parent)) return false;
		var normalizedPath = NormalizeAbsolute(path);
		var normalizedParent = NormalizeAbsolute(parent).TrimEnd('/');
		return normalizedPath == normalizedParent || normalizedPath.StartsWith($"{normalizedParent}/", StringComparison.Ordinal);
	}

	public static string Quote(string value)
	{
		return $"'{value.Replace("'", "'\\''")}'";
	}

	public static string Parent(string path)
	{
		var trimmed = path.TrimEnd('/');
		var separator = trimmed.LastIndexOf('/');
		return separator < 0 ? "." : separator == 0 ? "/" : trimmed[..separator];
	}
}
