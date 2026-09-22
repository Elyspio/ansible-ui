import { describe, expect, it } from "vite-plus/test";
import { resolveRuntimeConfig } from "./runtime";

const origin = "http://localhost:5173";

describe("resolveRuntimeConfig", () => {
	it("uses Aspire OIDC settings over deployed config", () => {
		const result = resolveRuntimeConfig(
			{
				endpoints: { core: "" },
				oauth: {
					authority: "https://sso.example.test/realms/main",
					client_id: "deployed-client",
				},
			},
			{
				VITE_OIDC_AUTHORITY: "http://localhost:8080/realms/ansible-ui",
				VITE_OIDC_CLIENT_ID: "ansible-ui",
			},
			origin,
		);

		expect(result.error).toBeUndefined();
		expect(result.config.oauth.authority).toBe("http://localhost:8080/realms/ansible-ui");
		expect(result.config.oauth.client_id).toBe("ansible-ui");
	});

	it("uses deployed OIDC settings outside Aspire", () => {
		const result = resolveRuntimeConfig(
			{
				endpoints: { core: "/api" },
				oauth: {
					authority: "https://sso.example.test/realms/main",
					client_id: "ansible-ui",
				},
			},
			{},
			origin,
		);

		expect(result.error).toBeUndefined();
		expect(result.config.oauth.redirect_uri).toBe(`${origin}/login/callback`);
		expect(result.config.oauth.post_logout_redirect_uri).toBe(`${origin}/`);
	});

	it.each([
		["missing authority", { authority: "", client_id: "ansible-ui" }],
		["invalid authority", { authority: "not-a-url", client_id: "ansible-ui" }],
		["missing client id", { authority: "https://sso.example.test/realms/main", client_id: "" }],
	])("reports %s", (_name, oauth) => {
		const result = resolveRuntimeConfig({ endpoints: { core: "" }, oauth }, {}, origin);

		expect(result.error).toBe("OIDC authority and client ID must be configured.");
	});
});
