using System.Text.RegularExpressions;
using AnsibleUi.Abstractions.Models;

namespace AnsibleUi.Core.Services;

/// <summary>Extracts the per-host Recap from the raw run output (final PLAY RECAP block).</summary>
public static partial class RecapParser
{
	[GeneratedRegex(@"\x1B\[[0-9;]*m")]
	private static partial Regex AnsiCodes();

	[GeneratedRegex(@"^(?<host>\S+)\s*:\s*ok=(?<ok>\d+)\s+changed=(?<changed>\d+)\s+unreachable=(?<unreachable>\d+)\s+failed=(?<failed>\d+)(?:\s+skipped=(?<skipped>\d+))?", RegexOptions.Multiline)]
	private static partial Regex RecapLine();

	public static IReadOnlyList<HostRecap> Parse(string output)
	{
		var text = AnsiCodes().Replace(output, "");

		// Only look after the last PLAY RECAP marker; host-pattern lines elsewhere would be noise.
		var marker = text.LastIndexOf("PLAY RECAP", StringComparison.Ordinal);
		if (marker < 0)
			return [];

		return RecapLine().Matches(text[marker..])
			.Select(m => new HostRecap(
				m.Groups["host"].Value,
				int.Parse(m.Groups["ok"].Value),
				int.Parse(m.Groups["changed"].Value),
				int.Parse(m.Groups["unreachable"].Value),
				int.Parse(m.Groups["failed"].Value),
				m.Groups["skipped"].Success ? int.Parse(m.Groups["skipped"].Value) : 0))
			.ToList();
	}
}
