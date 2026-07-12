using AnsibleUi.Abstractions.Interfaces;
using Microsoft.Extensions.DependencyInjection;

namespace AnsibleUi.Sockets.Injections;

public static class SocketsModule
{
	public static IServiceCollection AddAnsibleUiSockets(this IServiceCollection services)
	{
		services.AddSignalR();
		services.AddSingleton<IRealtimeNotifier, RealtimeNotifier>();
		return services;
	}
}
