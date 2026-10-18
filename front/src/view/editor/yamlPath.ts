import { isMap, isScalar, isSeq, parseDocument, type Node } from "yaml";

/** Keys from the document root down to the node under `offset`, e.g. all › children › db › hosts. */
export function yamlPathAt(text: string, offset: number): string[] {
	const doc = parseDocument(text, { keepSourceTokens: false });
	const path: string[] = [];
	let node: Node | null | undefined = doc.contents;
	while (node) {
		let next: Node | null | undefined = null;
		if (isMap(node)) {
			for (const pair of node.items) {
				const key = pair.key as Node | null;
				const value = pair.value as Node | null;
				const start = key?.range?.[0];
				const end = value?.range?.[1] ?? key?.range?.[1];
				if (start === undefined || end === undefined || offset < start || offset > end)
					continue;
				path.push(isScalar(key) ? String(key.value) : "?");
				next = value;
				break;
			}
		} else if (isSeq(node)) {
			node.items.forEach((item, index) => {
				const range = (item as Node | null)?.range;
				if (range && offset >= range[0] && offset <= range[1]) {
					path.push(`[${index}]`);
					next = item as Node;
				}
			});
		}
		node = next;
	}
	return path;
}
