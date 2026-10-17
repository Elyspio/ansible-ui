using AnsibleUi.Abstractions.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AnsibleUi.Web.Controllers;

/// <summary>Read-only files of the published Révision distante, open to every signed-in user.</summary>
[ApiController]
[Authorize]
[Route("api/files")]
public sealed class FilesController(IRepositorySynchronizer synchronizer, IRepositoryFiles files) : ControllerBase
{
	[HttpGet]
	public async Task<IActionResult> List(CancellationToken ct)
	{
		var revision = (await synchronizer.GetSnapshotAsync(ct)).Revision;
		return Ok(new { revision, files = await files.ListFilesAsync(revision, ct) });
	}

	/// <param name="revision">Revision returned by the listing; files are immutable per revision.</param>
	[HttpGet("content")]
	public async Task<IActionResult> Read([FromQuery] string revision, [FromQuery] string path, CancellationToken ct)
	{
		return Ok(await files.ReadFileAsync(revision, path, ct));
	}
}
