import { useMutation, useQueryClient } from "@tanstack/react-query";
import { http } from "./client";
import { qk } from "./queries";
import type { RepositoryStatus, Run } from "./types";

export interface SubmitRunRequest {
	playbook: string;
	limit: string | null;
	check: boolean;
	diff: boolean;
}

export function useSubmitRun() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (request: SubmitRunRequest) =>
			(await http.post<Run>("/api/runs", request)).data,
		onSuccess: () => void qc.invalidateQueries({ queryKey: qk.runs }),
	});
}

export function useCancelRun() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => await http.post(`/api/runs/${id}/cancel`),
		onSuccess: (_, id) => {
			void qc.invalidateQueries({ queryKey: qk.runs });
			void qc.invalidateQueries({ queryKey: qk.run(id) });
		},
	});
}

export function useSynchronizeRepository() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async () =>
			(await http.post<RepositoryStatus>("/api/repository/synchronize")).data,
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: qk.repository });
			void qc.invalidateQueries({ queryKey: qk.playbooks });
			void qc.invalidateQueries({ queryKey: qk.inventory });
		},
	});
}
