namespace AnsibleUi.Abstractions.Models;

/// <summary>
///     Text file of the Dépôt Ansible. <see cref="Content" /> is null for binary or oversized files,
///     which stay read-only like Ansible Vault files: their ciphertext is shown, never decrypted.
/// </summary>
/// <param name="Path">Path relative to the Ansible directory.</param>
/// <param name="Hash">SHA-256 of the raw bytes; sent back on write for optimistic concurrency.</param>
public sealed record RepositoryFile(
	string Path,
	string? Content,
	string Hash,
	long Size,
	bool IsVault,
	bool IsBinary,
	bool IsTooLarge)
{
	public bool IsReadOnly => IsVault || IsBinary || IsTooLarge;
}
