// Frontend RUNTIME configuration — read by src/config/runtime.ts at startup.
// This file (dev defaults) is served as-is by Vite. In production, the deployment
// overwrites /app/wwwroot/conf.js with the real values.
window.ansibleUi = window.ansibleUi || {};
window.ansibleUi.config = {
	// "" = same origin. In dev, Vite proxies /api and /hubs to the .NET API.
	endpoints: {
		core: "",
	},
	oauth: {
		// OIDC authority (e.g. Keycloak realm: https://sso.example.lan/realms/main).
		authority: "",
		client_id: "ansible-ui",
		redirect_uri: window.location.origin + "/login/callback",
		post_logout_redirect_uri: window.location.origin + "/",
		response_type: "code",
		scope: "openid profile email",
	},
};
