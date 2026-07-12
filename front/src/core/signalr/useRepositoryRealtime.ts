import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/core/api/queries";
import type { RepositoryStatus } from "@/core/api/types";
import { ensureStarted, getRunsHub } from "./connection";

export function useRepositoryRealtime(): void {
	const queryClient = useQueryClient();

	useEffect(() => {
		const hub = getRunsHub();
		const onRepositoryStatusChanged = (status: RepositoryStatus) => {
			queryClient.setQueryData(qk.repository, status);
		};
		const onRepositoryChanged = (status: RepositoryStatus) => {
			queryClient.setQueryData(qk.repository, status);
			void queryClient.invalidateQueries({ queryKey: qk.playbooks });
			void queryClient.invalidateQueries({ queryKey: qk.inventory });
		};

		hub.on("repositoryStatusChanged", onRepositoryStatusChanged);
		hub.on("repositoryChanged", onRepositoryChanged);
		void ensureStarted().catch(() => {
			/* automatic reconnect takes over */
		});
		return () => {
			hub.off("repositoryStatusChanged", onRepositoryStatusChanged);
			hub.off("repositoryChanged", onRepositoryChanged);
		};
	}, [queryClient]);
}
