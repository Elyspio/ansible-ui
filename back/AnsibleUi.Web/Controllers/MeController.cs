using AnsibleUi.Web.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AnsibleUi.Web.Controllers;

[ApiController]
[Authorize]
[Route("api/me")]
public sealed class MeController(IAuthorizationService authorization) : ControllerBase
{
	/// <summary>What the signed-in user may do; the UI hides actions the API would refuse.</summary>
	[HttpGet]
	public async Task<IActionResult> Get()
	{
		var canEdit = (await authorization.AuthorizeAsync(User, AuthPolicies.Editor)).Succeeded;
		return Ok(new { name = UserClaims.Name(User), canEdit });
	}
}
