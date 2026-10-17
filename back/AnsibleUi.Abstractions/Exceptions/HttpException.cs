namespace AnsibleUi.Abstractions.Exceptions;

/// <summary>Domain error carrying the HTTP status the API should answer with.</summary>
public class HttpException(int statusCode, string message) : Exception(message)
{
	public int StatusCode { get; } = statusCode;

	public static HttpException NotFound(string message)
	{
		return new HttpException(404, message);
	}

	public static HttpException Conflict(string message)
	{
		return new HttpException(409, message);
	}

	public static HttpException BadRequest(string message)
	{
		return new HttpException(400, message);
	}

	public static HttpException Forbidden(string message)
	{
		return new HttpException(403, message);
	}

	/// <summary>Git or forge rejected an operation the API relayed.</summary>
	public static HttpException BadGateway(string message)
	{
		return new HttpException(502, message);
	}
}
