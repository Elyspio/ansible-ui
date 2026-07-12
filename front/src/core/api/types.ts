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
	hosts: string[];
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
