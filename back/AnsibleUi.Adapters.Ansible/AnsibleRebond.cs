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
		return new Inventory(groups, hosts.Select(host => new InventoryHost(
			host,
			null,
			null,
			null,
			[],
			"unknown",
			null,
			null,
			null)).ToList());
	}

	public async Task<IReadOnlyList<InventoryHostFacts>> GetInventoryHostFactsAsync(CancellationToken ct = default)
	{
		const string factFilter = "ansible_os_family,ansible_distribution,ansible_default_ipv4,ansible_uptime_seconds";
		var sshArgument = _options.AcceptNewSshHostKeys
			? " --ssh-common-args '-o StrictHostKeyChecking=accept-new'"
			: "";
		var result = await commands.ExecuteAsync(
			$"cd {PosixShell.Quote(_options.WorkingDirectory)} && ANSIBLE_NOCOLOR=1 ansible all -m setup -a {PosixShell.Quote($"filter={factFilter}")}{sshArgument} -o", ct);

		return ParseHostFacts(result.StandardOutput);
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
		if (_options.AcceptNewSshHostKeys)
			arguments.Append(" --ssh-common-args '-o StrictHostKeyChecking=accept-new'");
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

	private static IReadOnlyList<InventoryHostFacts> ParseHostFacts(string output)
	{
		var facts = new List<InventoryHostFacts>();
		foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
		{
			var separator = line.IndexOf(" | ", StringComparison.Ordinal);
			var payloadStart = line.IndexOf(" => ", StringComparison.Ordinal);
			if (separator <= 0 || payloadStart <= separator) continue;

			var host = line[..separator].Trim();
			if (!SafeHostName().IsMatch(host)) continue;
			var result = line[(separator + 3)..payloadStart];
			var payload = line[(payloadStart + 4)..];
			if (result.StartsWith("UNREACHABLE", StringComparison.Ordinal))
			{
				facts.Add(new InventoryHostFacts(host, "unreachable", null, null, null, ReadProbeError(payload), null));
				continue;
			}
			if (!result.StartsWith("SUCCESS", StringComparison.Ordinal))
			{
				facts.Add(new InventoryHostFacts(host, "unknown", null, null, null, ReadProbeError(payload), null));
				continue;
			}

			try
			{
				using var json = JsonDocument.Parse(payload);
				var ansibleFacts = json.RootElement.TryGetProperty("ansible_facts", out var value) ? value : default;
				if (ansibleFacts.ValueKind != JsonValueKind.Object)
				{
					facts.Add(new InventoryHostFacts(host, "unknown", null, null, null, "Fact probe returned no facts.", null));
					continue;
				}
				facts.Add(new InventoryHostFacts(
					host,
					"reachable",
					ReadNestedString(ansibleFacts, "ansible_default_ipv4", "address"),
					ReadString(ansibleFacts, "ansible_distribution"),
					ReadString(ansibleFacts, "ansible_os_family"),
					null,
					ReadLong(ansibleFacts, "ansible_uptime_seconds") is { } seconds ? TimeSpan.FromSeconds(seconds) : null));
			}
			catch (JsonException)
			{
				facts.Add(new InventoryHostFacts(host, "unknown", null, null, null, "Fact probe returned malformed output.", null));
			}
		}
		return facts;
	}

	private static string? ReadString(JsonElement element, string property) =>
		element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
			? value.GetString()
			: null;

	private static string? ReadNestedString(JsonElement element, string property, string nestedProperty) =>
		element.TryGetProperty(property, out var nested) && nested.ValueKind == JsonValueKind.Object
			? ReadString(nested, nestedProperty)
			: null;

	private static long? ReadLong(JsonElement element, string property) =>
		element.TryGetProperty(property, out var value) && value.TryGetInt64(out var number) ? number : null;

	private static string ReadProbeError(string payload)
	{
		try
		{
			using var json = JsonDocument.Parse(payload);
			var message = ReadString(json.RootElement, "msg");
			if (string.IsNullOrWhiteSpace(message)) return "Fact probe failed without an error message.";
			message = message.Trim();
			return message[..Math.Min(message.Length, 500)];
		}
		catch (JsonException)
		{
			return "Fact probe returned malformed output.";
		}
	}

	[GeneratedRegex("^[A-Za-z0-9._-]+$")]
	private static partial Regex SafeHostName();
}
