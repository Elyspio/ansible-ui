using AnsibleUi.Abstractions.Interfaces;
using AnsibleUi.Adapters.MongoDB.Mongo;
using AnsibleUi.Adapters.MongoDB.Repositories;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;

namespace AnsibleUi.Adapters.MongoDB.Injections;

public static class DbModule
{
	public static IServiceCollection AddAnsibleUiDb(this IServiceCollection services, IConfiguration config)
	{
		MongoMappings.Register();

		var conn = config.GetConnectionString("MongoDB") ?? "mongodb://localhost:27017";
		var url = MongoUrl.Create(conn);
		var dbName = !string.IsNullOrWhiteSpace(url.DatabaseName)
			? url.DatabaseName
			: config["Mongo:Database"] ?? "ansible-ui";

		services.AddSingleton<IMongoClient>(_ => new MongoClient(conn));
		services.AddSingleton(sp => sp.GetRequiredService<IMongoClient>().GetDatabase(dbName));

		services.AddSingleton<IRunRepository, RunRepository>();

		return services;
	}
}
