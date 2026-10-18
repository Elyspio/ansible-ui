import { lazy, Suspense, type ComponentProps } from "react";
import { Box, CircularProgress } from "@mui/material";
import { terminal } from "@/config/theme";

// Monaco and its workers are several megabytes: load them only when a file is opened.
const CodeEditor = lazy(async () => ({ default: (await import("./CodeEditor")).CodeEditor }));

export function LazyCodeEditor(props: ComponentProps<typeof CodeEditor>) {
	return (
		<Suspense
			fallback={
				<Box
					sx={{
						display: "grid",
						placeItems: "center",
						height: "100%",
						bgcolor: terminal.background,
					}}
				>
					<CircularProgress size={20} />
				</Box>
			}
		>
			<CodeEditor {...props} />
		</Suspense>
	);
}
