import type { OAuthConfig, RuntimeConfig } from "@/vite-env";

export interface ResolvedRuntimeConfig {
	endpoints: { core: string };
	oauth: OAuthConfig;
}

export interface RuntimeConfigResolution {
	config: ResolvedRuntimeConfig;
	error?: string;
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

/** Resolves deployment config, with Aspire's local Keycloak settings taking precedence. */
export function resolveRuntimeConfig(
	configured: RuntimeConfig | undefined,
	env: Pick<ImportMetaEnv, "VITE_OIDC_AUTHORITY" | "VITE_OIDC_CLIENT_ID">,
	origin: string,
): RuntimeConfigResolution {
	const oauth = configured?.oauth;
	const authority = env.VITE_OIDC_AUTHORITY ?? oauth?.authority ?? "";
	const clientId = env.VITE_OIDC_CLIENT_ID ?? oauth?.client_id ?? "";
	const config: ResolvedRuntimeConfig = {
		endpoints: { core: configured?.endpoints?.core ?? "" },
		oauth: {
			authority,
			client_id: clientId,
			redirect_uri: oauth?.redirect_uri ?? `${origin}/login/callback`,
			post_logout_redirect_uri: oauth?.post_logout_redirect_uri ?? `${origin}/`,
			response_type: oauth?.response_type ?? "code",
			scope: oauth?.scope ?? "openid profile email",
		},
	};

	return {
		config,
		error:
			isHttpUrl(authority) && clientId.trim()
				? undefined
				: "OIDC authority and client ID must be configured.",
	};
}

const browserWindow = typeof window === "undefined" ? undefined : window;
const resolution = resolveRuntimeConfig(
	browserWindow?.ansibleUi?.config,
	import.meta.env,
	browserWindow?.location.origin ?? "http://localhost",
);

export const runtimeConfig = resolution.config;
export const runtimeConfigError = resolution.error;

/** API base URL. "" = same origin (dev via Vite proxy, prod single-container image). */
export const apiBaseUrl = runtimeConfig.endpoints.core ?? "";

/** App version = Docker tag injected at image build; "dev" outside the image. */
export const appVersion: string = import.meta.env.VITE_APP_VERSION ?? "dev";
