import { useEffect, type ReactNode } from "react";
import { AuthProvider as OidcProvider, useAuth as useOidc } from "react-oidc-context";
import { runtimeConfig, runtimeConfigError } from "@/config/runtime";
import { setAccessToken } from "@/core/api/client";
import { AppAuthContext, type AppAuth } from "./useAuth";
import { Splash } from "@/view/components/Splash";

const oidcConfig = {
	authority: runtimeConfig.oauth.authority,
	client_id: runtimeConfig.oauth.client_id,
	redirect_uri: runtimeConfig.oauth.redirect_uri,
	post_logout_redirect_uri: runtimeConfig.oauth.post_logout_redirect_uri,
	response_type: runtimeConfig.oauth.response_type,
	scope: runtimeConfig.oauth.scope,
	automaticSilentRenew: true,
	onSigninCallback: () => {
		window.history.replaceState(
			{},
			document.title,
			window.location.pathname.replace(/\/login\/callback$/, "/"),
		);
	},
};

function OidcBridge({ children }: { children: ReactNode }) {
	const oidc = useOidc();

	useEffect(() => {
		setAccessToken(oidc.user?.access_token ?? null);
	}, [oidc.user]);

	// Automatic sign-in when there is no active session.
	useEffect(() => {
		if (!oidc.isLoading && !oidc.isAuthenticated && !oidc.activeNavigator && !oidc.error) {
			void oidc.signinRedirect();
		}
	}, [oidc.isLoading, oidc.isAuthenticated, oidc.activeNavigator, oidc.error, oidc]);

	if (oidc.error) return <Splash title="Authentication error" subtitle={oidc.error.message} />;
	if (oidc.isLoading || !oidc.isAuthenticated || !oidc.user)
		return <Splash title="Signing in…" subtitle="Redirecting to the identity provider" />;

	const profile = oidc.user.profile;
	const value: AppAuth = {
		user: {
			name: (profile.name as string) || (profile.preferred_username as string) || "User",
			email: (profile.email as string) || "",
		},
		isAuthenticated: true,
		isLoading: false,
		accessToken: oidc.user.access_token ?? null,
		login: () => void oidc.signinRedirect(),
		logout: () => void oidc.signoutRedirect(),
	};
	return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
	if (runtimeConfigError)
		return (
			<Splash
				title="Authentication configuration error"
				subtitle={runtimeConfigError}
				loading={false}
			/>
		);

	return (
		<OidcProvider {...oidcConfig}>
			<OidcBridge>{children}</OidcBridge>
		</OidcProvider>
	);
}
