using AnsibleUi.Abstractions.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AnsibleUi.Web.Controllers;

[ApiController]
[Authorize]
[Route("api/repository")]
public sealed class RepositoryController(IRepositorySynchronizer synchronizer) : ControllerBase
{
	[HttpGet("status")]
	public IActionResult GetStatus()
	{
		return Ok(synchronizer.Status);
	}

	[HttpPost("synchronize")]
	public async Task<IActionResult> Synchronize(CancellationToken ct)
	{
		return Ok(await synchronizer.SynchronizeAsync(ct));
	}
}
