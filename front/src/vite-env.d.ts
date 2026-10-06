/// <reference types="vite-plus/client" />

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
	// Must live in `declare global`: this file is a module, so a top-level interface would not merge with Vite's.
	interface ImportMetaEnv {
		/** Docker tag injected at image build time; absent in dev. */
		readonly VITE_APP_VERSION?: string;
		/** OIDC authority injected by the Aspire AppHost for local dev; absent otherwise. */
		readonly VITE_OIDC_AUTHORITY?: string;
		/** OIDC client id injected by the Aspire AppHost for local dev; absent otherwise. */
		readonly VITE_OIDC_CLIENT_ID?: string;
	}

	interface Window {
		ansibleUi?: { config?: RuntimeConfig };
	}
}
