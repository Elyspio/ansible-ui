import { useQuery } from "@tanstack/react-query";
import { http } from "./client";
import type {
	Draft,
	DraftDetail,
	Inventory,
	Me,
	Playbook,
	PublishedFiles,
	RepositoryFile,
	RepositoryStatus,
	Run,
} from "./types";

export const qk = {
	me: ["me"] as const,
	playbooks: ["playbooks"] as const,
	runs: ["runs"] as const,
	run: (id: string) => ["runs", id] as const,
	inventory: ["inventory"] as const,
	hostVars: (host: string) => ["inventory", "hosts", host, "vars"] as const,
	repository: ["repository"] as const,
	files: ["files"] as const,
	file: (revision: string, path: string) => ["files", revision, path] as const,
	drafts: ["drafts"] as const,
	draft: (id: string) => ["drafts", id] as const,
	draftFiles: (id: string) => ["drafts", id, "files"] as const,
	draftFile: (id: string, path: string) => ["drafts", id, "file", path] as const,
	draftBaseFile: (id: string, path: string) => ["drafts", id, "base", path] as const,
	draftPlaybooks: (id: string) => ["drafts", id, "playbooks"] as const,
};

export function useMe() {
	return useQuery({
		queryKey: qk.me,
		queryFn: async () => (await http.get<Me>("/api/me")).data,
		staleTime: Infinity,
	});
}

export function usePlaybooks() {
	return useQuery({
		queryKey: qk.playbooks,
		queryFn: async () => (await http.get<Playbook[]>("/api/playbooks")).data,
		// SignalR invalidates this snapshot when the repository revision changes.
		staleTime: 60_000,
	});
}

export function useRuns() {
	return useQuery({
		queryKey: qk.runs,
		queryFn: async () => (await http.get<Run[]>("/api/runs", { params: { take: 50 } })).data,
	});
}

export function useRun(id: string | undefined) {
	return useQuery({
		queryKey: qk.run(id ?? ""),
		queryFn: async () => (await http.get<Run>(`/api/runs/${id}`)).data,
		enabled: !!id,
	});
}

export function useInventory() {
	return useQuery({
		queryKey: qk.inventory,
		queryFn: async () => (await http.get<Inventory>("/api/inventory")).data,
		staleTime: 60_000,
	});
}

export function useHostVars(host: string | null) {
	return useQuery({
		queryKey: qk.hostVars(host ?? ""),
		queryFn: async () => (await http.get<string>(`/api/inventory/hosts/${host}/vars`)).data,
		enabled: !!host,
		retry: false,
	});
}

export function useRepositoryStatus() {
	return useQuery({
		queryKey: qk.repository,
		queryFn: async () => (await http.get<RepositoryStatus>("/api/repository/status")).data,
	});
}

/** Files of the published Révision distante; SignalR invalidates it on a new revision. */
export function usePublishedFiles() {
	return useQuery({
		queryKey: qk.files,
		queryFn: async () => (await http.get<PublishedFiles>("/api/files")).data,
		staleTime: 60_000,
	});
}

export function usePublishedFile(revision: string | undefined, path: string | null) {
	return useQuery({
		queryKey: qk.file(revision ?? "", path ?? ""),
		queryFn: async () =>
			(await http.get<RepositoryFile>("/api/files/content", { params: { revision, path } }))
				.data,
		enabled: !!revision && !!path,
		// Immutable per revision.
		staleTime: Infinity,
	});
}

export function useDrafts(enabled = true) {
	return useQuery({
		queryKey: qk.drafts,
		queryFn: async () => (await http.get<Draft[]>("/api/drafts")).data,
		enabled,
	});
}

export function useDraft(id: string | undefined) {
	return useQuery({
		queryKey: qk.draft(id ?? ""),
		queryFn: async () => (await http.get<DraftDetail>(`/api/drafts/${id}`)).data,
		enabled: !!id,
	});
}

export function useDraftFiles(id: string | undefined, enabled = true) {
	return useQuery({
		queryKey: qk.draftFiles(id ?? ""),
		queryFn: async () => (await http.get<string[]>(`/api/drafts/${id}/files`)).data,
		enabled: !!id && enabled,
	});
}

/** Server copy of a Brouillon file; the workspace keeps unsaved edits locally on top of it. */
export function useDraftFile(id: string | undefined, path: string | null) {
	return useQuery({
		queryKey: qk.draftFile(id ?? "", path ?? ""),
		queryFn: async () =>
			(await http.get<RepositoryFile>(`/api/drafts/${id}/file`, { params: { path } })).data,
		enabled: !!id && !!path,
		staleTime: Infinity,
		retry: false,
	});
}

/** File at the merge base with the reference branch; null when the Brouillon added it. */
export function useDraftBaseFile(id: string | undefined, path: string | null, enabled: boolean) {
	return useQuery({
		queryKey: qk.draftBaseFile(id ?? "", path ?? ""),
		queryFn: async () => {
			const response = await http.get<RepositoryFile>(`/api/drafts/${id}/file/base`, {
				params: { path },
				validateStatus: (status) => status === 200 || status === 404,
			});
			return response.status === 404 ? null : response.data;
		},
		enabled: !!id && !!path && enabled,
	});
}

export function useDraftPlaybooks(id: string | undefined, enabled: boolean) {
	return useQuery({
		queryKey: qk.draftPlaybooks(id ?? ""),
		queryFn: async () => (await http.get<Playbook[]>(`/api/drafts/${id}/playbooks`)).data,
		enabled: !!id && enabled,
	});
}
