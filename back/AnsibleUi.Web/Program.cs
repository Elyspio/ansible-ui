using AnsibleUi.Adapters.MongoDB.Injections;
using AnsibleUi.Adapters.Ssh.Injections;
using AnsibleUi.Core.Injections;
using AnsibleUi.ServiceDefaults;
using AnsibleUi.Sockets.Hubs;
using AnsibleUi.Sockets.Injections;
using AnsibleUi.Web.Auth;
using AnsibleUi.Web.Filters;

var builder = WebApplication.CreateBuilder(args);

// Environment-specific config: mounted secret in production, gitignored local file in dev.
builder.Configuration.AddJsonFile("appsettings.docker.json", true, true);
builder.Configuration.AddJsonFile("appsettings.Local.json", true, true);

builder.AddServiceDefaults();

builder.Services.AddAnsibleUiDb(builder.Configuration);
builder.Services.AddAnsibleUiCore(builder.Configuration);
builder.Services.AddAnsibleUiSockets();
builder.Services.AddAnsibleUiAdapters(builder.Configuration);
builder.Services.AddAnsibleUiAuth(builder.Configuration);

builder.Services.AddControllers(options => options.Filters.Add<HttpExceptionFilter>());
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// CORS — front (dev: localhost:5173; prod: same origin) with credentials (SignalR).
const string corsPolicy = "spa";
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
var origins = allowedOrigins.Append("http://localhost:5173").Distinct().ToArray();
builder.Services.AddCors(options => options.AddPolicy(corsPolicy, policy =>
	policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

if (app.Environment.IsDevelopment())
{
	app.UseSwagger();
	app.UseSwaggerUI();
}

app.UseCors(corsPolicy);
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<RunHub>("/hubs/runs").RequireAuthorization();
app.MapDefaultEndpoints(); // /health, /alive

// SPA fallback — any non-API/non-hub route serves the React app (wwwroot/index.html).
app.MapFallbackToFile("index.html");

app.Run();
