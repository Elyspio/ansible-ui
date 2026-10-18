import { useMutation, useQueryClient } from "@tanstack/react-query";
import { http } from "./client";
import { qk } from "./queries";
import { validateDraftInventory } from "./draftFiles";
import type { Draft, RepositoryStatus, Run } from "./types";

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
			void qc.invalidateQueries({ queryKey: qk.files, exact: true });
		},
	});
}

export function useCreateDraft() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (title: string) =>
			(await http.post<Draft>("/api/drafts", { title })).data,
		onSuccess: () => void qc.invalidateQueries({ queryKey: qk.drafts, exact: true }),
	});
}

export interface WriteDraftFileRequest {
	path: string;
	content: string;
	/** Hash of the version the edit started from; null creates the file. */
	expectedHash: string | null;
}

/** Autosave and file creation. Callers own the buffer; this only refreshes the change list. */
export function useWriteDraftFile(draftId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (request: WriteDraftFileRequest) =>
			(await http.put<{ hash: string }>(`/api/drafts/${draftId}/file`, request)).data,
		onSuccess: (_, request) => {
			// Exact: the open file query must not refetch over the buffer being edited.
			void qc.invalidateQueries({ queryKey: qk.draft(draftId), exact: true });
			if (request.expectedHash === null)
				void qc.invalidateQueries({ queryKey: qk.draftFiles(draftId) });
		},
	});
}

function useDraftFilesMutation<T>(draftId: string, mutationFn: (request: T) => Promise<unknown>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn,
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: qk.draft(draftId), exact: true });
			void qc.invalidateQueries({ queryKey: qk.draftFiles(draftId) });
		},
	});
}

export function useDeleteDraftFile(draftId: string) {
	return useDraftFilesMutation(draftId, async (path: string) =>
		http.delete(`/api/drafts/${draftId}/file`, { params: { path } }),
	);
}

export function useRenameDraftFile(draftId: string) {
	return useDraftFilesMutation(draftId, async (request: { path: string; newPath: string }) =>
		http.post(`/api/drafts/${draftId}/file/rename`, request),
	);
}

function useDraftAction<T>(
	draftId: string,
	action: string,
	toBody: (request: T) => unknown,
	rewritesFiles = false,
) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (request: T) =>
			(await http.post<Draft>(`/api/drafts/${draftId}/${action}`, toBody(request))).data,
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: qk.drafts, exact: true });
			// A rebase rewrites files: refresh everything under this Brouillon, open files included.
			void qc.invalidateQueries({ queryKey: qk.draft(draftId), exact: !rewritesFiles });
		},
	});
}

export function useCommitDraft(draftId: string) {
	return useDraftAction(draftId, "commit", (message: string) => ({ message }));
}

export function useRebaseDraft(draftId: string) {
	return useDraftAction(draftId, "rebase", () => undefined, true);
}

export function useAbandonDraft(draftId: string) {
	return useDraftAction(draftId, "abandon", () => undefined);
}

export function useSubmitDraftRun(draftId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (request: SubmitRunRequest) =>
			(await http.post<Run>(`/api/drafts/${draftId}/runs`, request)).data,
		onSuccess: () => void qc.invalidateQueries({ queryKey: qk.runs }),
	});
}

/** API error message carried in `{ error }` bodies, falling back to the transport message. */
export function errorMessage(error: unknown): string {
	if (typeof error === "object" && error !== null && "response" in error) {
		const data = (error as { response?: { data?: unknown } }).response?.data;
		if (typeof data === "object" && data !== null && "error" in data)
			return String((data as { error: unknown }).error);
	}
	return error instanceof Error ? error.message : String(error);
}

/** True for the optimistic-concurrency refusal of a write whose base changed. */
export function isConflict(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { response?: { status?: number } }).response?.status === 409
	);
}

/** Runs ansible-inventory in the Brouillon worktree, saved edits included. */
export function useValidateDraftInventory(draftId: string) {
	return useMutation({
		mutationFn: () => validateDraftInventory(draftId),
	});
}
