/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Docker tag injected at image build time; absent in dev. */
	readonly VITE_APP_VERSION?: string;
	/** OIDC authority injected by the Aspire AppHost for local dev; absent otherwise. */
	readonly VITE_OIDC_AUTHORITY?: string;
	/** OIDC client id injected by the Aspire AppHost for local dev; absent otherwise. */
	readonly VITE_OIDC_CLIENT_ID?: string;
}

export interface OAuthConfig {
	authority: string;
	client_id: string;
	redirect_uri: string;
	post_logout_redirect_uri: string;
	response_type: string;
	scope: string;
}

export interface RuntimeConfig {
	endpoints?: { core?: string };
	oauth?: Partial<OAuthConfig>;
}

declare global {
	interface Window {
		ansibleUi?: { config?: RuntimeConfig };
	}
}
