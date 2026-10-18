import { http } from "./client";
import type { Draft, InventoryValidation, RepositoryFile } from "./types";

// Plain calls for multi-step flows (Add host) that chain several requests; callers invalidate
// the affected queries once the whole flow lands.

export async function createDraft(title: string): Promise<Draft> {
	return (await http.post<Draft>("/api/drafts", { title })).data;
}

/** Null when the file does not exist in the Brouillon. */
export async function readDraftFile(draftId: string, path: string): Promise<RepositoryFile | null> {
	const response = await http.get<RepositoryFile>(`/api/drafts/${draftId}/file`, {
		params: { path },
		validateStatus: (status) => status === 200 || status === 404,
	});
	return response.status === 404 ? null : response.data;
}

export async function writeDraftFile(
	draftId: string,
	path: string,
	content: string,
	expectedHash: string | null,
): Promise<string> {
	return (
		await http.put<{ hash: string }>(`/api/drafts/${draftId}/file`, {
			path,
			content,
			expectedHash,
		})
	).data.hash;
}

export async function readPublishedFile(revision: string, path: string): Promise<RepositoryFile> {
	return (await http.get<RepositoryFile>("/api/files/content", { params: { revision, path } }))
		.data;
}

export async function validateDraftInventory(draftId: string): Promise<InventoryValidation> {
	return (await http.post<InventoryValidation>(`/api/drafts/${draftId}/inventory/validate`)).data;
}
