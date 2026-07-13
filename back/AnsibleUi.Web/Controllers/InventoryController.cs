using AnsibleUi.Abstractions.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AnsibleUi.Web.Controllers;

[ApiController]
[Authorize]
[Route("api/inventory")]
public sealed class InventoryController(IRepositorySynchronizer synchronizer) : ControllerBase
{
	[HttpGet]
	public async Task<IActionResult> Get(CancellationToken ct)
	{
		return Ok(await synchronizer.GetInventoryAsync(ct));
	}

	/// <summary>Raw vars.yml of a host — vault values stay encrypted by construction.</summary>
	[HttpGet("hosts/{host}/vars")]
	public async Task<IActionResult> GetHostVars(string host, CancellationToken ct)
	{
		var vars = await synchronizer.GetHostVarsAsync(host, ct);
		return vars is null ? NotFound() : Content(vars, "text/plain");
	}
}
