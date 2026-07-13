// Aspire AppHost — orchestrates MongoDB + Keycloak + the .NET API + the Vite front (dev).

using Projects;

var builder = DistributedApplication.CreateBuilder(args);
var isE2E = string.Equals(builder.Configuration["E2E"], "true", StringComparison.OrdinalIgnoreCase);

var mongo = builder.AddMongoDB("mongo");
if (!isE2E) mongo.WithDataVolume();
var mongodb = mongo.AddDatabase("ansible-ui");

// Keycloak (local identity provider). Realm/client/dev-user seeded from ./realms on first run.
// Port pinned so the issuer URL is stable and identical for both the browser and the API.
var keycloak = builder.AddKeycloak("keycloak", 8080);
if (!isE2E) keycloak.WithDataVolume();
keycloak.WithRealmImport("./realms");

// Same host-mapped URL the browser and the API both use, so token issuer/audience line up.
var authority = ReferenceExpression.Create($"{keycloak.GetEndpoint("http")}/realms/ansible-ui");
const string clientId = "ansible-ui";

// .NET API — receives the Mongo connection under the "MongoDB" key expected by the app,
// plus OIDC bearer validation pointed at the local Keycloak realm.
var api = builder.AddProject<AnsibleUi_Web>("api")
	.WithReference(mongodb, "MongoDB")
	.WaitFor(mongodb)
	.WaitFor(keycloak)
	.WithEnvironment("Auth__Authority", authority)
	.WithEnvironment("Auth__Audience", clientId);

if (isE2E)
{
	// History E2E tests do not call SSH, but startup validation still requires a complete control-node shape.
	api.WithEnvironment("SshConnection__Host", "localhost")
		.WithEnvironment("SshConnection__User", "e2e")
		.WithEnvironment("SshConnection__PrivateKeyPath", "e2e")
		.WithEnvironment("GitRepository__Path", "/e2e")
		.WithEnvironment("GitRepository__Url", "ssh://git@example.invalid/ansible.git")
		.WithEnvironment("GitRepository__Branch", "main")
		.WithEnvironment("Ansible__WorkingDirectory", "/e2e");
}

// Vite front (Vite+). In dev the Vite proxy routes /api and /hubs to the API.
// The endpoint is pinned on 5173 and un-proxied: stable OIDC origin + working HMR websocket.
// VITE_OIDC_* enable Keycloak login without editing public/conf.js.
builder.AddViteApp("front", "../../front")
	.WithPnpm()
	.WithReference(api)
	.WithEnvironment("VITE_API_TARGET", api.GetEndpoint("https"))
	.WithEnvironment("VITE_OIDC_AUTHORITY", authority)
	.WithEnvironment("VITE_OIDC_CLIENT_ID", clientId)
	.WithEndpoint("http", endpoint =>
	{
		endpoint.Port = 5173;
		endpoint.TargetPort = 5173;
		endpoint.IsProxied = false;
	})
	.WaitFor(api);

builder.Build().Run();
