import { DiffEditor, Editor } from "@monaco-editor/react";
import { Box, CircularProgress } from "@mui/material";
import { fontMono, terminal } from "@/config/theme";
import { languageFor } from "./languages";
import { editorTheme } from "./monaco";

const options = {
	fontFamily: fontMono,
	fontSize: 13,
	lineHeight: 21,
	minimap: { enabled: false },
	scrollBeyondLastLine: false,
	renderWhitespace: "boundary",
	tabSize: 2,
	insertSpaces: true,
	automaticLayout: true,
	padding: { top: 12 },
	fixedOverflowWidgets: true,
} as const;

const loading = (
	<Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
		<CircularProgress size={20} />
	</Box>
);

/**
 * Monaco on the terminal surface. `modelPath` keys the model (and the YAML schema match),
 * so it must be unique per Brouillon or revision.
 */
export function CodeEditor({
	modelPath,
	filePath,
	value,
	original,
	readOnly,
	onChange,
}: {
	modelPath: string;
	filePath: string;
	value: string;
	/** When set, renders a side-by-side diff of `original` against `value` (read-only). */
	original?: string;
	readOnly?: boolean;
	onChange?: (value: string) => void;
}) {
	const language = languageFor(filePath);
	return (
		<Box sx={{ height: "100%", bgcolor: terminal.background }}>
			{original !== undefined ? (
				<DiffEditor
					theme={editorTheme}
					language={language}
					original={original}
					modified={value}
					originalModelPath={`${modelPath}?original`}
					modifiedModelPath={`${modelPath}?modified`}
					loading={loading}
					options={{ ...options, readOnly: true, renderSideBySide: true }}
				/>
			) : (
				<Editor
					theme={editorTheme}
					path={modelPath}
					language={language}
					value={value}
					loading={loading}
					options={{ ...options, readOnly }}
					onChange={(next) => onChange?.(next ?? "")}
				/>
			)}
		</Box>
	);
}
