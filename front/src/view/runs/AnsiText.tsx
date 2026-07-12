import { memo, type ReactNode } from "react";

// Minimal SGR renderer for ansible-playbook output (ANSIBLE_FORCE_COLOR).
// Supports reset, bold and the 16 foreground colors — everything Ansible emits.
const colors: Record<number, string> = {
	30: "#8a938e", // black → dim gray on dark terminal
	31: "#f0635f", // red — failed, errors
	32: "#4fce8f", // green — ok
	33: "#e6c452", // yellow — changed
	34: "#6fa8f5", // blue
	35: "#cf8ee6", // magenta — warnings
	36: "#57c7cc", // cyan — skipping, diff context
	37: "#d8dedb", // white
	90: "#707974",
	91: "#f78f8c",
	92: "#7adfab",
	93: "#eed685",
	94: "#94bff8",
	95: "#ddaced",
	96: "#84d8dc",
	97: "#f2f5f3",
};

interface Style {
	color?: string;
	bold?: boolean;
}

/** Parses SGR escape sequences into styled spans. Non-SGR escapes are dropped. */
export function ansiToSpans(text: string): ReactNode[] {
	const spans: ReactNode[] = [];
	// eslint-disable-next-line no-control-regex -- ESC is exactly what we're matching
	const pattern = /\u001B\[([0-9;]*)m/g;
	let style: Style = {};
	let cursor = 0;
	let key = 0;

	const push = (chunk: string) => {
		if (!chunk) return;
		if (style.color || style.bold) {
			spans.push(
				<span
					key={key++}
					style={{ color: style.color, fontWeight: style.bold ? 600 : undefined }}
				>
					{chunk}
				</span>,
			);
		} else {
			spans.push(chunk);
		}
	};

	for (const match of text.matchAll(pattern)) {
		push(text.slice(cursor, match.index));
		cursor = match.index + match[0].length;

		for (const code of (match[1] || "0").split(";").map(Number)) {
			if (code === 0) style = {};
			else if (code === 1) style = { ...style, bold: true };
			else if (code === 39) style = { ...style, color: undefined };
			else if (colors[code]) style = { ...style, color: colors[code] };
		}
	}
	push(text.slice(cursor));
	return spans;
}

/** Memoized: re-parses only when the text actually grows. */
export const AnsiText = memo(function AnsiText({ text }: { text: string }) {
	return <>{ansiToSpans(text)}</>;
});
