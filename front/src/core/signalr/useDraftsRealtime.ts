import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/core/api/queries";
import type { Draft } from "@/core/api/types";
import { ensureStarted, getRunsHub } from "./connection";

/**
 * Brouillon created, pushed, rebased or closed by anyone (or by the PR watcher): refresh lists
 * and the open workspace. File contents are not invalidated — an open editor keeps its buffer.
 */
export function useDraftsRealtime(): void {
	const qc = useQueryClient();

	useEffect(() => {
		const hub = getRunsHub();
		const onDraftChanged = (draft: Draft) => {
			void qc.invalidateQueries({ queryKey: qk.drafts, exact: true });
			void qc.invalidateQueries({ queryKey: qk.draft(draft.id), exact: true });
			void qc.invalidateQueries({ queryKey: qk.draftFiles(draft.id) });
			void qc.invalidateQueries({ queryKey: qk.draftPlaybooks(draft.id) });
		};

		hub.on("draftChanged", onDraftChanged);
		void ensureStarted().catch(() => {
			/* automatic reconnect takes over */
		});
		return () => hub.off("draftChanged", onDraftChanged);
	}, [qc]);
}
