using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using AnsibleUi.Core.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AnsibleUi.Web.Controllers;

[ApiController]
[Authorize]
[Route("api/runs")]
public sealed class RunsController(IRunRepository repository, RunLauncher launcher) : ControllerBase
{
	[HttpPost]
	public async Task<IActionResult> Submit(SubmitRunRequest request, CancellationToken ct)
	{
		if (string.IsNullOrWhiteSpace(request.Playbook))
			return BadRequest(new { error = "Playbook is required" });

		var user = User.FindFirst("name")?.Value ?? User.Identity?.Name ?? "unknown";
		var run = await launcher.SubmitAsync(request.Playbook,
			new RunOptions { Limit = request.Limit, Check = request.Check, Diff = request.Diff }, user, ct);

		return CreatedAtAction(nameof(Get), new { id = run.Id }, run);
	}

	[HttpGet]
	public async Task<IActionResult> List([FromQuery] int skip = 0, [FromQuery] int take = 25, CancellationToken ct = default)
	{
		return Ok(await repository.ListAsync(skip, int.Clamp(take, 1, 100), ct));
	}

	[HttpGet("{id:guid}")]
	public async Task<IActionResult> Get(Guid id, CancellationToken ct)
	{
		var run = await repository.GetAsync(id, ct);
		return run is null ? NotFound() : Ok(run);
	}

	[HttpPost("{id:guid}/cancel")]
	public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
	{
		await launcher.CancelAsync(id, ct);
		return NoContent();
	}

	public sealed record SubmitRunRequest(string Playbook, string? Limit, bool Check, bool Diff);
}
