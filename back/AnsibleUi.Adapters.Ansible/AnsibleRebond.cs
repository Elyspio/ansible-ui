using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using AnsibleUi.Abstractions;
using AnsibleUi.Abstractions.Exceptions;
using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Abstractions.Models;
using Microsoft.Extensions.Options;

namespace AnsibleUi.Adapters.Ansible;

public sealed partial class AnsibleRebond(
	IRemoteCommandExecutor commands,
	IOptions<AnsibleOptions> options) : IAnsibleRebond
{
	private readonly AnsibleOptions _options = options.Value;

	public async Task<IReadOnlyList<Playbook>> ListPlaybooksAsync(CancellationToken ct = default)
	{
		var result = await commands.ExecuteAsync(
			$"cd {PosixShell.Quote(_options.WorkingDirectory)} && find playbooks -type f \\( -name '*.yml' -o -name '*.yaml' \\) | sort", ct);
		RequireSuccess(result, "Could not list playbooks");
		return result.StandardOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
			.Select(path =>
			{
				var segments = path.Split('/');
				return new Playbook(path, Path.GetFileNameWithoutExtension(segments[^1]), segments.Length > 2 ? segments[^2] : "base");
			}).ToList();
	}

	public async Task<Inventory> GetInventoryAsync(CancellationToken ct = default)
	{
		var result = await commands.ExecuteAsync($"cd {PosixShell.Quote(_options.WorkingDirectory)} && ansible-inventory --list", ct);
		RequireSuccess(result, "ansible-inventory failed on the Rebond");
		using var json = JsonDocument.Parse(result.StandardOutput);
		var groups = new List<InventoryGroup>();
		var hosts = new SortedSet<string>(StringComparer.Ordinal);
		foreach (var property in json.RootElement.EnumerateObject())
		{
			if (property.Name is "_meta" or "all" or "ungrouped") continue;
			var groupHosts = ReadStringArray(property.Value, "hosts");
			var children = ReadStringArray(property.Value, "children");
			groups.Add(new InventoryGroup(property.Name, groupHosts, children));
			foreach (var host in groupHosts) hosts.Add(host);
		}
		if (json.RootElement.TryGetProperty("ungrouped", out var ungrouped))
			foreach (var host in ReadStringArray(ungrouped, "hosts")) hosts.Add(host);
		return new Inventory(groups, [.. hosts]);
	}

	public async Task<string?> GetHostVarsAsync(string host, CancellationToken ct = default)
	{
		if (!SafeHostName().IsMatch(host)) throw HttpException.BadRequest($"Invalid host name '{host}'");
		var result = await commands.ExecuteAsync(
			$"cd {PosixShell.Quote(_options.WorkingDirectory)} && cat inventory/host_vars/{PosixShell.Quote(host)}/vars.yml", ct);
		return result.Succeeded ? result.StandardOutput : null;
	}

	public async Task<int> ExecutePlaybookAsync(string playbook, RunOptions options, Func<string, Task> onOutput, CancellationToken ct)
	{
		var arguments = new StringBuilder($"ansible-playbook {PosixShell.Quote(playbook)}");
		if (!string.IsNullOrWhiteSpace(options.Limit)) arguments.Append($" --limit {PosixShell.Quote(options.Limit)}");
		if (options.Check) arguments.Append(" --check");
		if (options.Diff) arguments.Append(" --diff");
		var result = await commands.ExecuteStreamingAsync(
			$"cd {PosixShell.Quote(_options.WorkingDirectory)} && exec env ANSIBLE_FORCE_COLOR=True {arguments} 2>&1", onOutput, ct);
		return result.ExitCode;
	}

	private static void RequireSuccess(RemoteCommandResult result, string message)
	{
		if (!result.Succeeded) throw new InvalidOperationException($"{message}: {result.StandardError.Trim()}");
	}

	private static IReadOnlyList<string> ReadStringArray(JsonElement element, string property)
	{
		if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(property, out var array) || array.ValueKind != JsonValueKind.Array) return [];
		return [.. array.EnumerateArray().Select(item => item.GetString()!).Where(value => value is not null)];
	}

	[GeneratedRegex("^[A-Za-z0-9._-]+$")]
	private static partial Regex SafeHostName();
}
