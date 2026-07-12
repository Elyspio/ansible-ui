using AnsibleUi.Abstractions.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AnsibleUi.Web.Controllers;

[ApiController]
[Authorize]
[Route("api/playbooks")]
public sealed class PlaybooksController(IControlNode controlNode) : ControllerBase
{
	[HttpGet]
	public async Task<IActionResult> List(CancellationToken ct)
	{
		return Ok(await controlNode.ListPlaybooksAsync(ct));
	}
}
