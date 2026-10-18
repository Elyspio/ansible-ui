import { useEffect, useRef } from "react";
import { DiffEditor, Editor } from "@monaco-editor/react";
import { Box, CircularProgress } from "@mui/material";
import { fontMono, monoVariation, terminal } from "@/config/theme";
import { languageFor } from "./languages";
import { editorTheme } from "./monaco";

const options = {
	fontFamily: fontMono,
	fontVariations: monoVariation,
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

export interface Cursor {
	line: number;
	column: number;
	offset: number;
}

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
	onCursor,
}: {
	modelPath: string;
	filePath: string;
	value: string;
	/** When set, renders a side-by-side diff of `original` against `value` (read-only). */
	original?: string;
	readOnly?: boolean;
	onChange?: (value: string) => void;
	/** Caret moves in the editable editor: 1-based line and column, 0-based offset. */
	onCursor?: (cursor: Cursor) => void;
}) {
	const language = languageFor(filePath);
	// Monaco keeps the mount-time listener: read the latest callback through a ref.
	const cursorRef = useRef(onCursor);
	useEffect(() => {
		cursorRef.current = onCursor;
	});
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
					keepCurrentOriginalModel
					keepCurrentModifiedModel
					onMount={(editor) => {
						const models = editor.getModel();
						// The React wrapper disposes models before the diff widget. Defer model
						// disposal until the widget has detached them, including on view switches.
						editor.onDidDispose(() =>
							queueMicrotask(() => {
								for (const model of [models?.original, models?.modified])
									if (model && !model.isDisposed() && !model.isAttachedToEditor())
										model.dispose();
							}),
						);
					}}
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
					onMount={(editor) => {
						editor.onDidChangeCursorPosition(({ position }) =>
							cursorRef.current?.({
								line: position.lineNumber,
								column: position.column,
								offset: editor.getModel()?.getOffsetAt(position) ?? 0,
							}),
						);
					}}
				/>
			)}
		</Box>
	);
}
