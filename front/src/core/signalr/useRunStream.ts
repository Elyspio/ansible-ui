import { useEffect } from "react";
import { HubConnectionState } from "@microsoft/signalr";
import { ensureStarted, getRunsHub } from "./connection";

/**
 * Live output of one run: joins the hub group "run-{id}" and forwards each raw chunk.
 * The caller owns the buffer; on reconnect or late join, the REST detail endpoint
 * provides everything already persisted.
 */
export function useRunStream(runId: string | undefined, onChunk: (chunk: string) => void): void {
	useEffect(() => {
		if (!runId) return;

		const hub = getRunsHub();
		const handler = (id: string, chunk: string) => {
			if (id === runId) onChunk(chunk);
		};

		hub.on("runOutput", handler);
		let disposed = false;
		void ensureStarted()
			.then(() => {
				if (!disposed) return hub.invoke("WatchRun", runId);
			})
			.catch(() => {
				/* automatic reconnect takes over */
			});

		return () => {
			disposed = true;
			hub.off("runOutput", handler);
			if (hub.state === HubConnectionState.Connected)
				void hub.invoke("UnwatchRun", runId).catch(() => {});
		};
	}, [runId, onChunk]);
}
