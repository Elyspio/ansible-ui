import {
	isMap,
	isScalar,
	parseDocument,
	type Document,
	type Node,
	type Pair,
	type YAMLMap,
} from "yaml";

/** The inventory file Add host edits, relative to the Ansible directory. */
export const hostsFilePath = "inventory/hosts.yml";

export const hostVarsPath = (host: string) => `inventory/host_vars/${host}/vars.yml`;

/** Same rule as the API: a host name becomes a path and a command argument. */
export const safeHostName = /^[A-Za-z0-9._-]+$/;

const reserved = new Set(["all", "ungrouped"]);

export interface NewHost {
	host: string;
	/** Existing groups to add the host to. */
	groups: string[];
	/** Group created under all.children, holding the host. */
	newGroup?: string;
	ansibleHost?: string;
}

type GroupPair = Pair<Node, Node | null>;

function parse(text: string): Document.Parsed {
	const doc = parseDocument(text);
	if (doc.errors.length > 0)
		throw new Error(`${hostsFilePath} does not parse: ${doc.errors[0].message}`);
	return doc;
}

const keyName = (pair: Pair) => (isScalar(pair.key) ? String(pair.key.value) : null);

/** Group pairs: top-level keys, and keys of every `children` map below them. */
function groupPairs(doc: Document.Parsed): GroupPair[] {
	const found: GroupPair[] = [];
	const visit = (map: YAMLMap) => {
		for (const pair of map.items as GroupPair[]) {
			const name = keyName(pair);
			if (name === null) continue;
			found.push(pair);
			if (!isMap(pair.value)) continue;
			const children = pair.value.get("children", true);
			if (isMap(children)) visit(children);
		}
	};
	if (isMap(doc.contents)) visit(doc.contents);
	return found;
}

function hostsOf(pair: GroupPair): string[] {
	if (!isMap(pair.value)) return [];
	const hosts = pair.value.get("hosts", true);
	return isMap(hosts) ? (hosts.items as Pair[]).map(keyName).filter((name) => name !== null) : [];
}

export function listGroups(text: string): string[] {
	const names = groupPairs(parse(text))
		.map(keyName)
		.filter((name): name is string => name !== null && !reserved.has(name));
	return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export function hostsByGroup(text: string): Map<string, string[]> {
	const result = new Map<string, string[]>();
	for (const pair of groupPairs(parse(text))) {
		const name = keyName(pair);
		if (name) result.set(name, [...(result.get(name) ?? []), ...hostsOf(pair)]);
	}
	return result;
}

export function hasHost(text: string, host: string): boolean {
	return [...hostsByGroup(text).values()].some((hosts) => hosts.includes(host));
}

const lineStart = (text: string, offset: number) => text.lastIndexOf("\n", offset - 1) + 1;
const column = (text: string, offset: number) => offset - lineStart(text, offset);

/** Offset right after the line holding `offset`. */
function nextLine(text: string, offset: number): number {
	const end = text.indexOf("\n", offset);
	return end === -1 ? text.length : end + 1;
}

function insert(text: string, at: number, lines: string[]): string {
	const prefix = at === text.length && text.length > 0 && !text.endsWith("\n") ? "\n" : "";
	return `${text.slice(0, at)}${prefix}${lines.join("\n")}\n${text.slice(at)}`;
}

/** End of a pair's content, before any comment or blank line that follows it. */
function pairEnd(pair: Pair): number {
	const value = pair.value as Node | null;
	const key = pair.key as Node;
	return Math.max(value?.range?.[1] ?? 0, key.range?.[1] ?? 0);
}

function hostLines(host: string, indent: number, step: number, ansibleHost?: string): string[] {
	const pad = " ".repeat(indent);
	return ansibleHost
		? [`${pad}${host}:`, `${pad}${" ".repeat(step)}ansible_host: ${ansibleHost}`]
		: [`${pad}${host}:`];
}

/** Indentation step of the file, read from the first nested key; 2 when nothing is nested. */
function indentStep(text: string, doc: Document.Parsed): number {
	for (const pair of groupPairs(doc)) {
		if (!isMap(pair.value) || pair.value.items.length === 0) continue;
		const outer = column(text, (pair.key as Node).range![0]);
		const inner = column(text, ((pair.value.items[0] as Pair).key as Node).range![0]);
		if (inner > outer) return inner - outer;
	}
	return 2;
}

function requireBlock(node: Node | null | undefined, what: string) {
	if (isMap(node) && node.flow)
		throw new Error(`${what} uses flow style ({ }): add the host by hand`);
}

function addToGroup(text: string, group: string, host: string, ansibleHost?: string): string {
	const doc = parse(text);
	const step = indentStep(text, doc);
	const pair = groupPairs(doc).find((candidate) => keyName(candidate) === group);
	if (!pair) throw new Error(`Group ${group} is not in ${hostsFilePath}`);
	const groupKey = pair.key as Node;
	const groupIndent = column(text, groupKey.range![0]);
	const value = pair.value;

	if (!isMap(value)) {
		if (value && !(isScalar(value) && value.value === null))
			throw new Error(`Group ${group} is not a mapping`);
		return insert(text, nextLine(text, groupKey.range![0]), [
			`${" ".repeat(groupIndent + step)}hosts:`,
			...hostLines(host, groupIndent + 2 * step, step, ansibleHost),
		]);
	}
	requireBlock(value, `Group ${group}`);
	const hostsPair = (value.items as Pair[]).find((item) => keyName(item) === "hosts");
	if (!hostsPair)
		return insert(text, nextLine(text, groupKey.range![0]), [
			`${" ".repeat(groupIndent + step)}hosts:`,
			...hostLines(host, groupIndent + 2 * step, step, ansibleHost),
		]);

	const hostsKey = hostsPair.key as Node;
	const hosts = hostsPair.value as Node | null;
	requireBlock(hosts, `hosts of ${group}`);
	if (!isMap(hosts) || hosts.items.length === 0) {
		if (hosts && !(isScalar(hosts) && hosts.value === null) && !isMap(hosts))
			throw new Error(`hosts of ${group} is not a mapping`);
		const hostsIndent = column(text, hostsKey.range![0]);
		return insert(
			text,
			nextLine(text, hostsKey.range![0]),
			hostLines(host, hostsIndent + step, step, ansibleHost),
		);
	}
	requireBlock(hosts, `hosts of ${group}`);
	const items = hosts.items as Pair[];
	const indent = column(text, (items[0].key as Node).range![0]);
	const last = items[items.length - 1];
	return insert(
		text,
		nextLine(text, pairEnd(last) - 1),
		hostLines(host, indent, step, ansibleHost),
	);
}

function addGroup(text: string, group: string, host: string, ansibleHost?: string): string {
	const doc = parse(text);
	const step = indentStep(text, doc);
	const lines = (indent: number) => [
		`${" ".repeat(indent)}${group}:`,
		`${" ".repeat(indent + step)}hosts:`,
		...hostLines(host, indent + 2 * step, step, ansibleHost),
	];
	const root = doc.contents;
	if (!isMap(root)) {
		if (root) throw new Error(`${hostsFilePath} is not a mapping`);
		return insert(text, text.length, [
			"all:",
			`${" ".repeat(step)}children:`,
			...lines(2 * step),
		]);
	}
	requireBlock(root, "Inventory");
	const all = (root.items as Pair[]).find((pair) => keyName(pair) === "all");
	if (!all)
		return insert(text, text.length, [
			"all:",
			`${" ".repeat(step)}children:`,
			...lines(2 * step),
		]);
	const allKey = all.key as Node;
	const allIndent = column(text, allKey.range![0]);
	if (!isMap(all.value))
		return insert(text, nextLine(text, allKey.range![0]), [
			`${" ".repeat(allIndent + step)}children:`,
			...lines(allIndent + 2 * step),
		]);
	requireBlock(all.value, "all");
	const childrenPair = (all.value.items as Pair[]).find((pair) => keyName(pair) === "children");
	if (!childrenPair)
		return insert(text, nextLine(text, allKey.range![0]), [
			`${" ".repeat(allIndent + step)}children:`,
			...lines(allIndent + 2 * step),
		]);
	const children = childrenPair.value as Node | null;
	requireBlock(children, "all.children");
	const childrenKey = childrenPair.key as Node;
	if (!isMap(children) || children.items.length === 0)
		return insert(
			text,
			nextLine(text, childrenKey.range![0]),
			lines(column(text, childrenKey.range![0]) + step),
		);
	requireBlock(children, "all.children");
	const items = children.items as Pair[];
	const indent = column(text, (items[0].key as Node).range![0]);
	return insert(text, nextLine(text, pairEnd(items[items.length - 1]) - 1), lines(indent));
}

/**
 * Adds a host by splicing lines into the file rather than re-serializing it, so comments, ordering
 * and spacing stay exactly as written and the review diff shows only the new lines.
 */
export function addHost(text: string, request: NewHost): string {
	const host = request.host.trim();
	if (!safeHostName.test(host))
		throw new Error("Host names use letters, digits, dot, dash and underscore only");
	if (hasHost(text, host)) throw new Error(`${host} is already in ${hostsFilePath}`);
	const newGroup = request.newGroup?.trim() || undefined;
	if (newGroup) {
		if (!safeHostName.test(newGroup))
			throw new Error("Group names use letters, digits, dot, dash and underscore only");
		if (reserved.has(newGroup) || listGroups(text).includes(newGroup))
			throw new Error(`Group ${newGroup} already exists`);
	}
	if (request.groups.length === 0 && !newGroup) throw new Error("Pick at least one group");
	const ansibleHost = request.ansibleHost?.trim() || undefined;
	if (ansibleHost && !/^[A-Za-z0-9.:_-]+$/.test(ansibleHost))
		throw new Error("ansible_host must be an address or a host name");

	// Connection vars once: Ansible merges a host's vars across groups.
	let next = text;
	let pendingVars = ansibleHost;
	for (const group of request.groups) {
		next = addToGroup(next, group, host, pendingVars);
		pendingVars = undefined;
	}
	if (newGroup) next = addGroup(next, newGroup, host, pendingVars);

	const placed = hostsByGroup(next);
	for (const group of [...request.groups, ...(newGroup ? [newGroup] : [])])
		if (!placed.get(group)?.includes(host))
			throw new Error(`Could not place ${host} in ${group}`);
	return next;
}
