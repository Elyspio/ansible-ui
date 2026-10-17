using System.Security.Cryptography;
using System.Text;
using AnsibleUi.Abstractions;
using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Adapters.Git;

/// <summary>Shared encoding rules for files crossing the SSH transport as base64.</summary>
internal static class RemoteFiles
{
	public const long MaxSize = 1024 * 1024;

	/// <summary>Remote scripts embed at most this much base64 per command: one shell argument is capped at 128 KiB on Linux.</summary>
	public const int ChunkSize = 64 * 1024;

	public const string VaultHeader = "$ANSIBLE_VAULT;";

	private static readonly UTF8Encoding StrictUtf8 = new(false, true);

	/// <summary>Parses "&lt;size&gt;\n&lt;base64&gt;" emitted by read scripts; base64 is omitted above <see cref="MaxSize" />.</summary>
	public static RepositoryFile Parse(string path, string output)
	{
		var newline = output.IndexOf('\n');
		var size = long.Parse(newline < 0 ? output.Trim() : output[..newline].Trim());
		if (size > MaxSize) return new RepositoryFile(path, null, "", size, false, false, true);

		var bytes = Convert.FromBase64String(newline < 0 ? "" : output[(newline + 1)..].Trim());
		var hash = Hash(bytes);
		string text;
		try
		{
			text = StrictUtf8.GetString(bytes);
		}
		catch (DecoderFallbackException)
		{
			return new RepositoryFile(path, null, hash, size, false, true, false);
		}
		if (text.Contains('\0')) return new RepositoryFile(path, null, hash, size, false, true, false);
		return new RepositoryFile(path, text, hash, size, text.StartsWith(VaultHeader, StringComparison.Ordinal), false, false);
	}

	public static string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));

	public static byte[] Encode(string content)
	{
		var bytes = Encoding.UTF8.GetBytes(content);
		if (bytes.Length > MaxSize) throw HttpException.BadRequest($"Files are limited to {MaxSize / 1024} KiB");
		if (content.StartsWith(VaultHeader, StringComparison.Ordinal))
			throw HttpException.Conflict("Ansible Vault files are read-only in Ansible UI");
		return bytes;
	}

	/// <summary>Splits NUL-separated Git output, dropping the trailing empty entry.</summary>
	public static string[] SplitNul(string output) =>
		output.Split('\0', StringSplitOptions.RemoveEmptyEntries);

	/// <summary>Maps a repository-root path to one relative to the Ansible directory; null when outside it.</summary>
	public static string? ToAnsiblePath(string repositoryPath, string ansibleDirectory)
	{
		if (ansibleDirectory == "") return repositoryPath;
		var prefix = ansibleDirectory + "/";
		return repositoryPath.StartsWith(prefix, StringComparison.Ordinal) ? repositoryPath[prefix.Length..] : null;
	}

	public static string ToRepositoryPath(string ansiblePath, string ansibleDirectory) =>
		ansibleDirectory == "" ? ansiblePath : $"{ansibleDirectory}/{ansiblePath}";

	/// <summary>Git pathspec restricting a command to the Ansible directory (empty for the root).</summary>
	public static string Pathspec(string ansibleDirectory) =>
		ansibleDirectory == "" ? "" : $" -- {PosixShell.Quote(ansibleDirectory)}";

	/// <summary>Script reading a blob "<paramref name="objectExpression" />" (shell expression) as "size\nbase64". Exit 3 when absent.</summary>
	public static string ReadBlobScript(string objectExpression) =>
		$"o={objectExpression}; t=$(git cat-file -t \"$o\" 2>/dev/null) || exit 3; [ \"$t\" = blob ] || exit 3; " +
		$"s=$(git cat-file -s \"$o\") || exit 1; echo \"$s\"; " +
		$"if [ \"$s\" -le {MaxSize} ]; then git cat-file blob \"$o\" | base64 -w0; fi";
}
