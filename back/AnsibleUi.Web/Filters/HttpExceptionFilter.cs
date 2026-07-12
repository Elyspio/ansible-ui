using AnsibleUi.Abstractions.Exceptions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace AnsibleUi.Web.Filters;

/// <summary>Maps HttpException thrown by the domain to the corresponding HTTP response.</summary>
public sealed class HttpExceptionFilter : IExceptionFilter
{
	public void OnException(ExceptionContext context)
	{
		if (context.Exception is not HttpException e)
			return;

		context.Result = new ObjectResult(new { error = e.Message }) { StatusCode = e.StatusCode };
		context.ExceptionHandled = true;
	}
}
