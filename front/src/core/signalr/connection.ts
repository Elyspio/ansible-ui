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
const watchedRuns = new Set<string>();

export function getRunsHub(): HubConnection {
	if (!connection) {
		connection = new HubConnectionBuilder()
			.withUrl(`${apiBaseUrl}/hubs/runs`, {
				accessTokenFactory: () => getAccessToken() ?? "",
			})
			.withAutomaticReconnect()
			.configureLogging(LogLevel.Warning)
			.build();
		connection.onreconnected(async () => {
			await Promise.allSettled(
				[...watchedRuns].map((runId) => connection!.invoke("WatchRun", runId)),
			);
		});
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

/** Watches a run now and restores that group membership after reconnects. */
export async function watchRun(runId: string): Promise<void> {
	watchedRuns.add(runId);
	await ensureStarted();
	await getRunsHub().invoke("WatchRun", runId);
}

/** Stops local tracking even if hub is disconnected. */
export function unwatchRun(runId: string): void {
	watchedRuns.delete(runId);
	const hub = getRunsHub();
	if (hub.state === HubConnectionState.Connected)
		void hub.invoke("UnwatchRun", runId).catch(() => {});
}
