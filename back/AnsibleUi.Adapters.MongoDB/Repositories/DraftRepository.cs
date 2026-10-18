using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using MongoDB.Driver;

namespace AnsibleUi.Adapters.MongoDB.Repositories;

public sealed class DraftRepository(IMongoDatabase database) : IDraftRepository
{
	private readonly IMongoCollection<Draft> _drafts = database.GetCollection<Draft>("drafts");

	public Task InsertAsync(Draft draft, CancellationToken ct = default)
	{
		return _drafts.InsertOneAsync(draft, cancellationToken: ct);
	}

	public async Task<Draft?> GetAsync(Guid id, CancellationToken ct = default)
	{
		return await _drafts.Find(d => d.Id == id).FirstOrDefaultAsync(ct);
	}

	public async Task<IReadOnlyList<Draft>> ListAsync(int take, CancellationToken ct = default)
	{
		return await _drafts.Find(FilterDefinition<Draft>.Empty)
			.SortByDescending(d => d.CreatedAt)
			.Limit(take)
			.ToListAsync(ct);
	}

	public async Task<IReadOnlyList<Draft>> ListOpenAsync(CancellationToken ct = default)
	{
		return await _drafts.Find(d => d.Status == DraftStatus.Open)
			.SortBy(d => d.CreatedAt)
			.ToListAsync(ct);
	}

	public Task UpdateAsync(Draft draft, CancellationToken ct = default)
	{
		return _drafts.ReplaceOneAsync(d => d.Id == draft.Id, draft, cancellationToken: ct);
	}
}
