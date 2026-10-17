using AnsibleUi.Abstractions;
using Shouldly;
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
		PosixShell.IsContainedIn(path, "/srv/repository").ShouldBe(expected);
	}

	[Fact]
	public void Login_shell_quoting_keeps_quotes_and_backslashes_out_of_single_quotes()
	{
		// fish reads \' and \ as escapes inside single quotes; sh, bash and zsh do not.
		PosixShell.QuoteForLoginShell(@"echo 'a\' $HOME").ShouldBe("'echo '\"'\"'a'\"\\\\\"''\"'\"' $HOME'");
	}
}
