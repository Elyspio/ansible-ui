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
}
