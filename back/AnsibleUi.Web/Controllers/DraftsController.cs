using AnsibleUi.Abstractions.Models;
using AnsibleUi.Core.Services;
using AnsibleUi.Web.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AnsibleUi.Web.Controllers;

/// <summary>Brouillons: editor-only, since a Run de brouillon executes unreviewed code on managed hosts.</summary>
[ApiController]
[Authorize(Policy = AuthPolicies.Editor)]
[Route("api/drafts")]
public sealed class DraftsController(DraftService drafts, RunLauncher launcher) : ControllerBase
{
	[HttpGet]
	public async Task<IActionResult> List(CancellationToken ct)
	{
		return Ok(await drafts.ListAsync(ct));
	}

	[HttpPost]
	public async Task<IActionResult> Create(CreateDraftRequest request, CancellationToken ct)
	{
		var draft = await drafts.CreateAsync(request.Title, UserClaims.DraftUser(User), ct);
		return CreatedAtAction(nameof(Get), new { id = draft.Id }, draft);
	}

	[HttpGet("{id:guid}")]
	public async Task<IActionResult> Get(Guid id, CancellationToken ct)
	{
		return Ok(await drafts.GetAsync(id, ct));
	}

	[HttpGet("{id:guid}/files")]
	public async Task<IActionResult> ListFiles(Guid id, CancellationToken ct)
	{
		return Ok(await drafts.ListFilesAsync(id, ct));
	}

	[HttpGet("{id:guid}/file")]
	public async Task<IActionResult> ReadFile(Guid id, [FromQuery] string path, CancellationToken ct)
	{
		return Ok(await drafts.ReadFileAsync(id, path, ct));
	}

	/// <summary>File at the merge base with the reference branch, for the review diff.</summary>
	[HttpGet("{id:guid}/file/base")]
	public async Task<IActionResult> ReadBaseFile(Guid id, [FromQuery] string path, CancellationToken ct)
	{
		var file = await drafts.ReadBaseFileAsync(id, path, ct);
		return file is null ? NotFound() : Ok(file);
	}

	[HttpPut("{id:guid}/file")]
	public async Task<IActionResult> WriteFile(Guid id, WriteFileRequest request, CancellationToken ct)
	{
		var hash = await drafts.WriteFileAsync(id, request.Path, request.Content, request.ExpectedHash, ct);
		return Ok(new { hash });
	}

	[HttpDelete("{id:guid}/file")]
	public async Task<IActionResult> DeleteFile(Guid id, [FromQuery] string path, CancellationToken ct)
	{
		await drafts.DeleteFileAsync(id, path, ct);
		return NoContent();
	}

	[HttpPost("{id:guid}/file/rename")]
	public async Task<IActionResult> RenameFile(Guid id, RenameFileRequest request, CancellationToken ct)
	{
		await drafts.RenameFileAsync(id, request.Path, request.NewPath, ct);
		return NoContent();
	}

	[HttpPost("{id:guid}/inventory/validate")]
	public async Task<IActionResult> ValidateInventory(Guid id, CancellationToken ct)
	{
		return Ok(await drafts.ValidateInventoryAsync(id, ct));
	}

	[HttpPost("{id:guid}/commit")]
	public async Task<IActionResult> Commit(Guid id, CommitRequest request, CancellationToken ct)
	{
		return Ok(await drafts.CommitAsync(id, request.Message, UserClaims.DraftUser(User), ct));
	}

	[HttpPost("{id:guid}/rebase")]
	public async Task<IActionResult> Rebase(Guid id, CancellationToken ct)
	{
		return Ok(await drafts.RebaseAsync(id, ct));
	}

	[HttpPost("{id:guid}/abandon")]
	public async Task<IActionResult> Abandon(Guid id, CancellationToken ct)
	{
		return Ok(await drafts.AbandonAsync(id, ct));
	}

	[HttpGet("{id:guid}/playbooks")]
	public async Task<IActionResult> ListPlaybooks(Guid id, CancellationToken ct)
	{
		return Ok(await drafts.ListPlaybooksAsync(id, ct));
	}

	/// <summary>Run de brouillon: same queue as every Run, on the Brouillon's pushed commit.</summary>
	[HttpPost("{id:guid}/runs")]
	public async Task<IActionResult> SubmitRun(Guid id, RunsController.SubmitRunRequest request, CancellationToken ct)
	{
		if (string.IsNullOrWhiteSpace(request.Playbook))
			return BadRequest(new { error = "Playbook is required" });

		var source = await drafts.CreateRunSourceAsync(id, ct);
		var run = await launcher.SubmitAsync(request.Playbook,
			new RunOptions { Limit = request.Limit, Check = request.Check, Diff = request.Diff },
			UserClaims.Name(User), source, ct);
		return CreatedAtAction(nameof(RunsController.Get), "Runs", new { id = run.Id }, run);
	}

	public sealed record CreateDraftRequest(string Title);

	public sealed record WriteFileRequest(string Path, string Content, string? ExpectedHash);

	public sealed record RenameFileRequest(string Path, string NewPath);

	public sealed record CommitRequest(string Message);
}
