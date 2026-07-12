import {
	HubConnection,
	HubConnectionBuilder,
	HubConnectionState,
	LogLevel,
} from "@microsoft/signalr";
import { apiBaseUrl } from "@/config/runtime";
import { getAccessToken } from "@/core/api/client";

// Single shared connection to the runs hub; hooks register handlers and hub groups on it.
let connection: HubConnection | null = null;
let starting: Promise<void> | null = null;

export function getRunsHub(): HubConnection {
	if (!connection) {
		connection = new HubConnectionBuilder()
			.withUrl(`${apiBaseUrl}/hubs/runs`, {
				accessTokenFactory: () => getAccessToken() ?? "",
			})
			.withAutomaticReconnect()
			.configureLogging(LogLevel.Warning)
			.build();
	}
	return connection;
}

/** Resolves once the connection is up; safe to call repeatedly. */
export async function ensureStarted(): Promise<HubConnection> {
	const hub = getRunsHub();
	if (hub.state === HubConnectionState.Disconnected) {
		starting ??= hub.start().finally(() => {
			starting = null;
		});
	}
	if (starting) await starting;
	return hub;
}
