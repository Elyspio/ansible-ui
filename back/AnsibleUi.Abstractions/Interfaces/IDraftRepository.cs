using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Abstractions.Interfaces;

public interface IDraftRepository
{
	Task InsertAsync(Draft draft, CancellationToken ct = default);
	Task<Draft?> GetAsync(Guid id, CancellationToken ct = default);

	/// <summary>Newest first, every status.</summary>
	Task<IReadOnlyList<Draft>> ListAsync(int take, CancellationToken ct = default);

	Task<IReadOnlyList<Draft>> ListOpenAsync(CancellationToken ct = default);
	Task UpdateAsync(Draft draft, CancellationToken ct = default);
}
