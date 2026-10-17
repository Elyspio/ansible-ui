export type RunStatus = "Queued" | "Running" | "Succeeded" | "Failed" | "Canceled" | "Interrupted";

export interface RunOptions {
	limit: string | null;
	check: boolean;
	diff: boolean;
}

export interface HostRecap {
	host: string;
	ok: number;
	changed: number;
	unreachable: number;
	failed: number;
	skipped: number;
}

export interface Run {
	id: string;
	playbook: string;
	options: RunOptions;
	/** Set for a Run de brouillon. */
	draft: DraftRunSource | null;
	status: RunStatus;
	requestedBy: string;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
	exitCode: number | null;
	/** Present on the detail endpoint only; history lists omit it. */
	output?: string[];
	recap: HostRecap[];
}

export interface Playbook {
	path: string;
	name: string;
	category: string;
}

export interface InventoryGroup {
	name: string;
	hosts: string[];
	children: string[];
}

export interface Inventory {
	groups: InventoryGroup[];
	hosts: InventoryHost[];
}

export type InventoryHostStatus = "reachable" | "unreachable" | "unknown";

export interface InventoryHost {
	name: string;
	ip: string | null;
	os: string | null;
	osFamily: string | null;
	groups: string[];
	status: InventoryHostStatus;
	error: string | null;
	uptime: string | null;
	lastChecked: string | null;
}

export interface RepositoryStatus {
	revision: string | null;
	remoteRevision: string | null;
	lastCheckedAt: string | null;
	lastSynchronizedAt: string | null;
	isSynchronizing: boolean;
	isRunningPlaybook: boolean;
	isDegraded: boolean;
	error: string | null;
}

/** What the signed-in user may do; mirrors GET /api/me. */
export interface Me {
	name: string;
	canEdit: boolean;
}

/** Run de brouillon source: the pushed Brouillon commit a Run executes. */
export interface DraftRunSource {
	draftId: string;
	title: string;
	branch: string;
	revision: string;
	pullRequestUrl: string | null;
}

export type DraftStatus = "Open" | "Merged" | "Closed" | "Abandoned";

export interface Draft {
	id: string;
	title: string;
	branch: string;
	baseRevision: string;
	headRevision: string | null;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
	status: DraftStatus;
	closedAt: string | null;
	pullRequestNumber: number | null;
	pullRequestUrl: string | null;
}

export type DraftFileChangeKind = "Added" | "Modified" | "Deleted" | "Renamed";

export interface DraftFileChange {
	path: string;
	kind: DraftFileChangeKind;
	previousPath: string | null;
}

export interface DraftWorkspaceStatus {
	headRevision: string;
	pushedRevision: string | null;
	ahead: number;
	behind: number;
	hasUncommittedChanges: boolean;
	changes: DraftFileChange[];
}

export type CommitCheckState = "None" | "Pending" | "Success" | "Failure";

export interface CommitChecks {
	state: CommitCheckState;
	targetUrl: string | null;
}

export interface DraftDetail {
	draft: Draft;
	/** Null once the Brouillon is closed. */
	workspace: DraftWorkspaceStatus | null;
	/** Null before the first push or when the forge is unreachable. */
	checks: CommitChecks | null;
}

/** Text file of the Dépôt Ansible; content is null for binary or oversized files. */
export interface RepositoryFile {
	path: string;
	content: string | null;
	/** SHA-256 of the raw bytes, sent back on write for optimistic concurrency. */
	hash: string;
	size: number;
	isVault: boolean;
	isBinary: boolean;
	isTooLarge: boolean;
	isReadOnly: boolean;
}

export interface PublishedFiles {
	revision: string;
	files: string[];
}
