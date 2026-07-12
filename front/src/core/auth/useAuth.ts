import { createContext, useContext } from "react";

export interface AppAuth {
	user: { name: string; email: string };
	isAuthenticated: boolean;
	isLoading: boolean;
	accessToken: string | null;
	login: () => void;
	logout: () => void;
}

export const AppAuthContext = createContext<AppAuth | null>(null);

export function useAuth(): AppAuth {
	const ctx = useContext(AppAuthContext);
	if (!ctx) throw new Error("useAuth must be used within AuthProvider");
	return ctx;
}
