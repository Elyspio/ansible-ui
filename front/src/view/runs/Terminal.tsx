import { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import { terminal } from "@/config/theme";
import { AnsiText } from "./AnsiText";

/**
 * Always-dark log pane. Sticks to the bottom while streaming, but stops following
 * as soon as the user scrolls up to read something.
 */
export function Terminal({ text, follow = true }: { text: string; follow?: boolean }) {
	const boxRef = useRef<HTMLDivElement>(null);
	const pinnedRef = useRef(true);

	useEffect(() => {
		const box = boxRef.current;
		if (box && follow && pinnedRef.current) box.scrollTop = box.scrollHeight;
	}, [text, follow]);

	return (
		<Box
			ref={boxRef}
			onScroll={() => {
				const box = boxRef.current;
				if (box)
					pinnedRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
			}}
			sx={{
				flex: 1,
				minHeight: 240,
				overflow: "auto",
				bgcolor: terminal.background,
				color: terminal.text,
				border: `1px solid ${terminal.border}`,
				borderRadius: 2,
				px: 2.5,
				py: 2,
				fontFamily: terminal.fontFamily,
				fontSize: 12.5,
				lineHeight: 1.6,
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
				colorScheme: "dark",
			}}
		>
			<AnsiText text={text} />
		</Box>
	);
}
