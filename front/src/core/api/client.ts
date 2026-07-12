import axios from "axios";
import { apiBaseUrl } from "@/config/runtime";

// Current bearer token — fed by the auth layer (AuthProvider). Avoids a circular
// dependency between axios and oidc-client-ts.
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
	accessToken = token;
}
export function getAccessToken(): string | null {
	return accessToken;
}

export const http = axios.create({ baseURL: apiBaseUrl });

http.interceptors.request.use((config) => {
	if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
	return config;
});
