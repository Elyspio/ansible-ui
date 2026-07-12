using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using MongoDB.Driver;

namespace AnsibleUi.Adapters.MongoDB.Repositories;

public sealed class RunRepository(IMongoDatabase database) : IRunRepository
{
	private readonly IMongoCollection<Run> _runs = database.GetCollection<Run>("runs");

	public Task InsertAsync(Run run, CancellationToken ct = default)
	{
		return _runs.InsertOneAsync(run, cancellationToken: ct);
	}

	public async Task<Run?> GetAsync(Guid id, CancellationToken ct = default)
	{
		return await _runs.Find(r => r.Id == id).FirstOrDefaultAsync(ct);
	}

	public async Task<IReadOnlyList<Run>> ListAsync(int skip, int take, CancellationToken ct = default)
	{
		return await _runs.Find(FilterDefinition<Run>.Empty)
			.SortByDescending(r => r.CreatedAt)
			.Skip(skip)
			.Limit(take)
			.Project<Run>(Builders<Run>.Projection.Exclude(r => r.Output))
			.ToListAsync(ct);
	}

	public Task SetStatusAsync(Guid id, RunStatus status, DateTime? startedAt = null, DateTime? finishedAt = null, int? exitCode = null, CancellationToken ct = default)
	{
		var update = Builders<Run>.Update.Set(r => r.Status, status);
		if (startedAt is not null)
			update = update.Set(r => r.StartedAt, startedAt);
		if (finishedAt is not null)
			update = update.Set(r => r.FinishedAt, finishedAt);
		if (exitCode is not null)
			update = update.Set(r => r.ExitCode, exitCode);
		return _runs.UpdateOneAsync(r => r.Id == id, update, cancellationToken: ct);
	}

	public Task AppendOutputAsync(Guid id, string chunk, CancellationToken ct = default)
	{
		return _runs.UpdateOneAsync(r => r.Id == id,
			Builders<Run>.Update.Push(r => r.Output, chunk), cancellationToken: ct);
	}

	public Task SetRecapAsync(Guid id, IReadOnlyList<HostRecap> recap, CancellationToken ct = default)
	{
		return _runs.UpdateOneAsync(r => r.Id == id,
			Builders<Run>.Update.Set(r => r.Recap, recap.ToList()), cancellationToken: ct);
	}

	public async Task<long> MarkRunningAsInterruptedAsync(CancellationToken ct = default)
	{
		var result = await _runs.UpdateManyAsync(
			r => r.Status == RunStatus.Running,
			Builders<Run>.Update
				.Set(r => r.Status, RunStatus.Interrupted)
				.Set(r => r.FinishedAt, DateTime.UtcNow),
			cancellationToken: ct);
		return result.ModifiedCount;
	}

	public async Task<IReadOnlyList<Run>> ListQueuedAsync(CancellationToken ct = default)
	{
		return await _runs.Find(r => r.Status == RunStatus.Queued)
			.SortBy(r => r.CreatedAt)
			.ToListAsync(ct);
	}
}
