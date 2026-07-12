using System.Collections.Concurrent;
using System.Text;
using System.Threading.Channels;
using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AnsibleUi.Core.Services;

/// <summary>
///     The queue: a single Run executes at a time; anything submitted meanwhile waits as Queued.
///     On startup, runs left Running by a dead instance become Interrupted and Queued ones are re-enqueued.
/// </summary>
public sealed class RunLauncher(IServiceProvider services, ILogger<RunLauncher> logger) : BackgroundService
{
	private readonly ConcurrentDictionary<Guid, CancellationTokenSource> _active = new();
	private readonly Channel<Guid> _queue = Channel.CreateUnbounded<Guid>();

	public async Task<Run> SubmitAsync(string playbook, RunOptions options, string requestedBy, CancellationToken ct = default)
	{
		var run = new Run { Playbook = playbook, Options = options, RequestedBy = requestedBy };

		using var scope = services.CreateScope();
		await scope.ServiceProvider.GetRequiredService<IRunRepository>().InsertAsync(run, ct);
		await scope.ServiceProvider.GetRequiredService<IRealtimeNotifier>().RunChangedAsync(run);

		await _queue.Writer.WriteAsync(run.Id, ct);
		return run;
	}

	public async Task CancelAsync(Guid id, CancellationToken ct = default)
	{
		// Running: interrupt the remote process; the execution loop then finalizes as Canceled.
		if (_active.TryGetValue(id, out var cts))
		{
			await cts.CancelAsync();
			return;
		}

		// Queued: mark Canceled now; the dequeue loop skips anything no longer Queued.
		using var scope = services.CreateScope();
		var repository = scope.ServiceProvider.GetRequiredService<IRunRepository>();
		var run = await repository.GetAsync(id, ct) ?? throw HttpException.NotFound($"Run {id} not found");
		if (run.Status != RunStatus.Queued)
			throw HttpException.Conflict($"Run {id} is {run.Status}; only Queued or Running runs can be canceled");

		await repository.SetStatusAsync(id, RunStatus.Canceled, finishedAt: DateTime.UtcNow, ct: ct);
		run.Status = RunStatus.Canceled;
		await scope.ServiceProvider.GetRequiredService<IRealtimeNotifier>().RunChangedAsync(run);
	}

	protected override async Task ExecuteAsync(CancellationToken stoppingToken)
	{
		await RecoverFromPreviousInstanceAsync(stoppingToken);

		await foreach (var runId in _queue.Reader.ReadAllAsync(stoppingToken))
		{
			using var scope = services.CreateScope();
			var repository = scope.ServiceProvider.GetRequiredService<IRunRepository>();

			var run = await repository.GetAsync(runId, stoppingToken);
			if (run is null || run.Status != RunStatus.Queued)
				continue; // canceled while waiting

			await ExecuteRunAsync(run, scope.ServiceProvider, stoppingToken);
		}
	}

	private async Task ExecuteRunAsync(Run run, IServiceProvider scoped, CancellationToken stoppingToken)
	{
		var repository = scoped.GetRequiredService<IRunRepository>();
		var notifier = scoped.GetRequiredService<IRealtimeNotifier>();
		var controlNode = scoped.GetRequiredService<IControlNode>();

		using var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
		_active[run.Id] = cts;

		run.Status = RunStatus.Running;
		run.StartedAt = DateTime.UtcNow;
		await repository.SetStatusAsync(run.Id, RunStatus.Running, run.StartedAt, ct: stoppingToken);
		await notifier.RunChangedAsync(run);

		var buffer = new StringBuilder();
		try
		{
			var exitCode = await controlNode.ExecutePlaybookAsync(run.Playbook, run.Options,
				async chunk =>
				{
					buffer.Append(chunk);
					await repository.AppendOutputAsync(run.Id, chunk, CancellationToken.None);
					await notifier.RunOutputAsync(run.Id, chunk);
				}, cts.Token);

			run.Status = exitCode == 0 ? RunStatus.Succeeded : RunStatus.Failed;
			run.ExitCode = exitCode;
		}
		catch (OperationCanceledException) when (cts.IsCancellationRequested && !stoppingToken.IsCancellationRequested)
		{
			run.Status = RunStatus.Canceled;
		}
		catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
		{
			// Shutdown mid-run: leave it Running; the next instance marks it Interrupted.
			throw;
		}
		catch (Exception e)
		{
			// Preparation failures too (SSH unreachable, git pull failed): Failed, reason in the log.
			logger.LogError(e, "Run {RunId} failed outside ansible-playbook", run.Id);
			var message = $"\n[ansible-ui] {e.Message}\n";
			await repository.AppendOutputAsync(run.Id, message, CancellationToken.None);
			await notifier.RunOutputAsync(run.Id, message);
			run.Status = RunStatus.Failed;
		}
		finally
		{
			_active.TryRemove(run.Id, out _);
		}

		run.FinishedAt = DateTime.UtcNow;
		run.Recap = RecapParser.Parse(buffer.ToString()).ToList();
		await repository.SetRecapAsync(run.Id, run.Recap, CancellationToken.None);
		await repository.SetStatusAsync(run.Id, run.Status, finishedAt: run.FinishedAt, exitCode: run.ExitCode, ct: CancellationToken.None);
		await notifier.RunChangedAsync(run);
	}

	private async Task RecoverFromPreviousInstanceAsync(CancellationToken ct)
	{
		using var scope = services.CreateScope();
		var repository = scope.ServiceProvider.GetRequiredService<IRunRepository>();

		var interrupted = await repository.MarkRunningAsInterruptedAsync(ct);
		if (interrupted > 0)
			logger.LogWarning("{Count} run(s) from a previous instance marked Interrupted", interrupted);

		foreach (var queued in await repository.ListQueuedAsync(ct))
			await _queue.Writer.WriteAsync(queued.Id, ct);
	}
}
