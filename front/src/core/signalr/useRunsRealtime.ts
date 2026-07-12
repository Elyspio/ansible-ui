import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/core/api/queries";
import type { Run } from "@/core/api/types";
import { ensureStarted, getRunsHub } from "./connection";

/**
 * App-level subscription: every run status transition (Queued→Running→terminal) is broadcast
 * by the API and refreshes the history list and the run detail everywhere.
 */
export function useRunsRealtime(): void {
	const qc = useQueryClient();

	useEffect(() => {
		const hub = getRunsHub();
		const onRunChanged = (run: Run) => {
			void qc.invalidateQueries({ queryKey: qk.runs });
			void qc.invalidateQueries({ queryKey: qk.run(run.id) });
		};

		hub.on("runChanged", onRunChanged);
		void ensureStarted().catch(() => {
			/* automatic reconnect takes over */
		});

		return () => hub.off("runChanged", onRunChanged);
	}, [qc]);
}
