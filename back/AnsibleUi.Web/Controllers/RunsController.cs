using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using AnsibleUi.Core.Services;
using AnsibleUi.Web.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AnsibleUi.Web.Controllers;

[ApiController]
[Authorize]
[Route("api/runs")]
public sealed class RunsController(IRunRepository repository, RunLauncher launcher, IAuthorizationService authorization) : ControllerBase
{
	[HttpPost]
	public async Task<IActionResult> Submit(SubmitRunRequest request, CancellationToken ct)
	{
		if (string.IsNullOrWhiteSpace(request.Playbook))
			return BadRequest(new { error = "Playbook is required" });

		var run = await launcher.SubmitAsync(request.Playbook,
			new RunOptions { Limit = request.Limit, Check = request.Check, Diff = request.Diff }, UserClaims.Name(User), ct: ct);

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

	/// <summary>Submits a new Run from persisted options; a Run de brouillon retains its frozen commit.</summary>
	[HttpPost("{id:guid}/repeat")]
	public async Task<IActionResult> Repeat(Guid id, CancellationToken ct)
	{
		var original = await repository.GetAsync(id, ct);
		if (original is null) return NotFound();
		if (original.Draft is not null && !(await authorization.AuthorizeAsync(User, AuthPolicies.Editor)).Succeeded)
			return Forbid();
		var run = await launcher.SubmitAsync(original.Playbook, original.Options, UserClaims.Name(User), original.Draft, ct);
		return CreatedAtAction(nameof(Get), new { id = run.Id }, run);
	}

	public sealed record SubmitRunRequest(string Playbook, string? Limit, bool Check, bool Diff);
}
