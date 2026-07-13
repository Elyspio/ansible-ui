using AnsibleUi.Abstractions;
using Xunit;

namespace AnsibleUi.Adapters.Tests;

public sealed class PosixShellTests
{
	[Theory]
	[InlineData("/srv/repository/ansible", true)]
	[InlineData("/srv/repository/../outside", false)]
	[InlineData("/srv/repository-other/ansible", false)]
	public void Containment_normalizes_posix_paths(string path, bool expected)
	{
		Assert.Equal(expected, PosixShell.IsContainedIn(path, "/srv/repository"));
	}
}
