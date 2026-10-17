using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Abstractions.Interfaces;

/// <summary>Read-only files of a published revision, read from Git objects so no repository lock is needed.</summary>
public interface IRepositoryFiles
{
	Task<IReadOnlyList<string>> ListFilesAsync(string revision, CancellationToken ct = default);
	Task<RepositoryFile> ReadFileAsync(string revision, string path, CancellationToken ct = default);
}
