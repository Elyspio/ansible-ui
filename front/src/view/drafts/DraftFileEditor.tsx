import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Alert, Box, Button, CircularProgress } from "@mui/material";
import { isConflict, errorMessage, useWriteDraftFile } from "@/core/api/mutations";
import { useDraftBaseFile, useDraftFile } from "@/core/api/queries";
import { FileNotice } from "@/view/editor/FileNotice";
import { LazyCodeEditor } from "@/view/editor/LazyCodeEditor";

export type SaveState = "saved" | "edited" | "saving" | "conflict" | "failed";

const autosaveDelay = 1000;

/**
 * One Brouillon file. The buffer lives here; every pause in typing writes it to the worktree with
 * the hash it was based on, so a concurrent edit (another tab, another editor) surfaces as a
 * conflict instead of being overwritten. Unmounting flushes pending edits.
 */
export function DraftFileEditor({
	draftId,
	path,
	diff,
	flushRef,
	onSaveState,
}: {
	draftId: string;
	path: string;
	/** Side-by-side against the merge base with the reference branch. */
	diff: boolean;
	flushRef: RefObject<(() => Promise<void>) | null>;
	onSaveState: (state: SaveState) => void;
}) {
	const file = useDraftFile(draftId, path);
	const base = useDraftBaseFile(draftId, path, diff);
	// mutateAsync is stable across renders, unlike the mutation result object.
	const writeFile = useWriteDraftFile(draftId).mutateAsync;

	const [buffer, setBuffer] = useState<string | null>(null);
	const [state, setState] = useState<SaveState>("saved");
	const [failure, setFailure] = useState<string | null>(null);
	const bufferRef = useRef<string | null>(null);
	const hashRef = useRef<string | null>(null);
	const savedRef = useRef<string | null>(null);
	const stateRef = useRef<SaveState>("saved");
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const chainRef = useRef<Promise<void>>(Promise.resolve());

	const updateState = useCallback(
		(next: SaveState) => {
			stateRef.current = next;
			setState(next);
			onSaveState(next);
		},
		[onSaveState],
	);

	const adopt = useCallback(
		(content: string | null, hash: string) => {
			bufferRef.current = content;
			savedRef.current = content;
			hashRef.current = hash;
			setBuffer(content);
			setFailure(null);
			updateState("saved");
		},
		[updateState],
	);

	// First load, or the server copy changed (rebase) while nothing local is pending.
	useEffect(() => {
		if (!file.data) return;
		const pristine = bufferRef.current === savedRef.current;
		if (bufferRef.current === null || (pristine && file.data.hash !== hashRef.current))
			adopt(file.data.content, file.data.hash);
	}, [file.data, adopt]);

	const save = useCallback((): Promise<void> => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = null;
		// Writes are chained so each one carries the hash returned by the previous one.
		chainRef.current = chainRef.current.then(async () => {
			const content = bufferRef.current;
			if (content === null || content === savedRef.current || stateRef.current === "conflict")
				return;
			updateState("saving");
			try {
				const { hash } = await writeFile({
					path,
					content,
					expectedHash: hashRef.current,
				});
				hashRef.current = hash;
				savedRef.current = content;
				setFailure(null);
				updateState(bufferRef.current === content ? "saved" : "edited");
			} catch (error) {
				setFailure(errorMessage(error));
				updateState(isConflict(error) ? "conflict" : "failed");
			}
		});
		return chainRef.current;
	}, [path, writeFile, updateState]);

	useEffect(() => {
		flushRef.current = save;
	}, [flushRef, save]);

	// Leaving the file (or the page) never drops typed text.
	useEffect(
		() => () => {
			if (bufferRef.current !== savedRef.current) void flushRef.current?.();
		},
		[flushRef],
	);

	const change = (content: string) => {
		bufferRef.current = content;
		setBuffer(content);
		if (stateRef.current === "conflict") return;
		updateState("edited");
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => void save(), autosaveDelay);
	};

	const reload = async () => {
		const fresh = await file.refetch();
		if (fresh.data) adopt(fresh.data.content, fresh.data.hash);
	};

	const overwrite = async () => {
		const fresh = await file.refetch();
		if (!fresh.data) return;
		hashRef.current = fresh.data.hash;
		savedRef.current = fresh.data.content;
		updateState("edited");
		await save();
	};

	if (file.error)
		return (
			<Alert severity="error" sx={{ m: 2 }}>
				Could not open {path}: {errorMessage(file.error)}
			</Alert>
		);
	if (!file.data || (buffer === null && file.data.content !== null))
		return (
			<Box sx={{ display: "grid", placeItems: "center", flex: 1 }}>
				<CircularProgress size={20} />
			</Box>
		);

	const modelPath = `file:///drafts/${draftId}/${path}`;
	return (
		<>
			<FileNotice file={file.data} />
			{state === "conflict" && (
				<Alert
					severity="warning"
					sx={{ borderRadius: 0 }}
					action={
						<Box sx={{ display: "flex", gap: 1 }}>
							<Button color="inherit" size="small" onClick={() => void reload()}>
								Discard mine
							</Button>
							<Button color="inherit" size="small" onClick={() => void overwrite()}>
								Keep mine
							</Button>
						</Box>
					}
				>
					This file changed since you opened it. Autosave is paused.
				</Alert>
			)}
			{state === "failed" && failure && (
				<Alert
					severity="error"
					sx={{ borderRadius: 0 }}
					action={
						<Button color="inherit" size="small" onClick={() => void save()}>
							Retry
						</Button>
					}
				>
					Not saved: {failure}
				</Alert>
			)}
			{file.data.content !== null && (
				<Box sx={{ flex: 1, minHeight: 0 }}>
					{diff ? (
						<LazyCodeEditor
							modelPath={modelPath}
							filePath={path}
							value={buffer ?? ""}
							original={base.data?.content ?? ""}
						/>
					) : (
						<LazyCodeEditor
							modelPath={modelPath}
							filePath={path}
							value={buffer ?? ""}
							readOnly={file.data.isReadOnly}
							onChange={change}
						/>
					)}
				</Box>
			)}
		</>
	);
}
