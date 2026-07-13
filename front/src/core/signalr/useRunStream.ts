import { useEffect } from "react";
import { getRunsHub, unwatchRun, watchRun } from "./connection";

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
			if (String(id).toLowerCase() === runId.toLowerCase()) onChunk(chunk);
		};

		hub.on("runOutput", handler);
		void watchRun(runId).catch(() => {
			/* automatic reconnect takes over */
		});

		return () => {
			hub.off("runOutput", handler);
			unwatchRun(runId);
		};
	}, [runId, onChunk]);
}
