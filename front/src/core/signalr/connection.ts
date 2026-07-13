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

// `watchedRuns` is the *desired* group membership; `joined` mirrors the server's actual
// state. All group RPCs run through `chain` so watch/unwatch for the same run apply in
// call order — this makes StrictMode's mount→cleanup→mount double-invoke (WatchRun,
// UnwatchRun, WatchRun) settle deterministically in the group instead of racing out of it.
const watchedRuns = new Set<string>();
const joined = new Set<string>();
let chain: Promise<void> = Promise.resolve();

export function getRunsHub(): HubConnection {
	if (!connection) {
		connection = new HubConnectionBuilder()
			.withUrl(`${apiBaseUrl}/hubs/runs`, {
				accessTokenFactory: () => getAccessToken() ?? "",
			})
			.withAutomaticReconnect()
			.configureLogging(LogLevel.Warning)
			.build();
		connection.onreconnected(() => syncWatches());
	}
	return connection;
}

/** Serially drives the server's group membership for one run toward `watchedRuns`. */
function reconcile(runId: string): Promise<void> {
	chain = chain
		.then(async () => {
			const hub = getRunsHub();
			if (hub.state !== HubConnectionState.Connected) return; // syncWatches() on (re)connect covers it
			const want = watchedRuns.has(runId);
			if (want && !joined.has(runId)) {
				await hub.invoke("WatchRun", runId);
				joined.add(runId);
			} else if (!want && joined.has(runId)) {
				await hub.invoke("UnwatchRun", runId);
				joined.delete(runId);
			}
		})
		.catch(() => {
			/* transient invoke failure; a later reconcile or reconnect retries */
		});
	return chain;
}

/** (Re)joins every desired run group. Called whenever the hub reaches Connected. */
async function syncWatches(): Promise<void> {
	joined.clear(); // server dropped all group membership on (re)connect
	await Promise.all([...watchedRuns].map((runId) => reconcile(runId)));
}

/** Resolves once the connection is truly Connected; safe to call repeatedly. */
export async function ensureStarted(): Promise<HubConnection> {
	const hub = getRunsHub();

	if (hub.state === HubConnectionState.Disconnected) {
		starting ??= hub
			.start()
			.then(() => syncWatches())
			.finally(() => {
				starting = null;
			});
	}
	if (starting) {
		await starting;
		return hub;
	}

	// Connecting / Reconnecting with no start promise to await (e.g. automatic
	// reconnect in flight): wait until the state settles before returning.
	while (hub.state !== HubConnectionState.Connected) {
		if (hub.state === HubConnectionState.Disconnected) return ensureStarted();
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	return hub;
}

/** Watches a run now and restores that group membership after reconnects. */
export async function watchRun(runId: string): Promise<void> {
	watchedRuns.add(runId);
	await ensureStarted();
	await reconcile(runId);
}

/** Stops watching; the actual UnwatchRun is serialized behind any pending WatchRun. */
export function unwatchRun(runId: string): void {
	watchedRuns.delete(runId);
	void reconcile(runId);
}
