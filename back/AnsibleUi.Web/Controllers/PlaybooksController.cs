using AnsibleUi.Abstractions.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AnsibleUi.Web.Controllers;

[ApiController]
[Authorize]
[Route("api/playbooks")]
public sealed class PlaybooksController(IRepositorySynchronizer synchronizer) : ControllerBase
{
	[HttpGet]
	public async Task<IActionResult> List(CancellationToken ct)
	{
		return Ok((await synchronizer.GetSnapshotAsync(ct)).Playbooks);
	}
}
