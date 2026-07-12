using System.ComponentModel.DataAnnotations;

namespace AnsibleUi.Core.Services;

public sealed class RepositorySynchronizationOptions
{
	public const string SectionName = "RepositorySynchronization";

	[Range(typeof(TimeSpan), "00:00:00.100", "1.00:00:00")]
	public TimeSpan ProbeInterval { get; set; } = TimeSpan.FromSeconds(1);
}
