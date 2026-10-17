import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from "react-router";
import {
	Alert,
	Box,
	Button,
	Chip,
	IconButton,
	Link,
	Menu,
	MenuItem,
	Skeleton,
	Tab,
	Tabs,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography,
	useTheme,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CallSplitRoundedIcon from "@mui/icons-material/CallSplitRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DriveFileRenameOutlineRoundedIcon from "@mui/icons-material/DriveFileRenameOutlineRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import NoteAddOutlinedIcon from "@mui/icons-material/NoteAddOutlined";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import { useSnackbar } from "notistack";
import { useDraft, useDraftBaseFile, useDraftFiles } from "@/core/api/queries";
import {
	errorMessage,
	useAbandonDraft,
	useCommitDraft,
	useDeleteDraftFile,
	useRebaseDraft,
	useRenameDraftFile,
	useWriteDraftFile,
} from "@/core/api/mutations";
import type { CommitChecks, DraftDetail, DraftFileChangeKind } from "@/core/api/types";
import { fontMono } from "@/config/theme";
import { EmptyState } from "@/view/components/EmptyState";
import { changeColor, changeLetter } from "@/view/editor/changes";
import { FileTree } from "@/view/editor/FileTree";
import { LazyCodeEditor } from "@/view/editor/LazyCodeEditor";
import { PaneBar, SplitPanel } from "@/view/editor/SplitPanel";
import { DraftFileEditor, type SaveState } from "./DraftFileEditor";
import { CommitDialog, ConfirmDialog, PathDialog } from "./DraftDialogs";
import { DraftLaunchDialog } from "./DraftLaunchDialog";
import { DraftStatusChip } from "./DraftStatusChip";

const saveLabels: Record<SaveState, string> = {
	saved: "Saved",
	edited: "Edited",
	saving: "Saving…",
	conflict: "Conflict",
	failed: "Not saved",
};

function ChecksChip({ checks }: { checks: CommitChecks | null }) {
	if (!checks || checks.state === "None") return null;
	const color =
		checks.state === "Success" ? "success" : checks.state === "Failure" ? "error" : "default";
	const label =
		checks.state === "Success"
			? "checks passed"
			: checks.state === "Failure"
				? "checks failed"
				: "checks running";
	return checks.targetUrl ? (
		<Chip
			size="small"
			variant="outlined"
			color={color}
			label={label}
			component="a"
			href={checks.targetUrl}
			target="_blank"
			rel="noreferrer"
			clickable
		/>
	) : (
		<Chip size="small" variant="outlined" color={color} label={label} />
	);
}

type Dialog = "commit" | "run" | "rebase" | "abandon" | "create" | "rename" | "delete" | null;

export function DraftWorkspacePage() {
	const { id = "" } = useParams<{ id: string }>();
	const theme = useTheme();
	const navigate = useNavigate();
	const { enqueueSnackbar } = useSnackbar();
	const [params, setParams] = useSearchParams();
	const selected = params.get("path");

	const detail = useDraft(id);
	const isOpen = detail.data?.draft.status === "Open";
	const files = useDraftFiles(id, isOpen);
	const commit = useCommitDraft(id);
	const rebase = useRebaseDraft(id);
	const abandon = useAbandonDraft(id);
	const createFile = useWriteDraftFile(id);
	const renameFile = useRenameDraftFile(id);
	const deleteFile = useDeleteDraftFile(id);

	const [tab, setTab] = useState<"files" | "changes">("files");
	const [diff, setDiff] = useState(false);
	const [dialog, setDialog] = useState<Dialog>(null);
	const [menu, setMenu] = useState<HTMLElement | null>(null);
	const [saveState, setSaveState] = useState<SaveState>("saved");
	const flushRef = useRef<(() => Promise<void>) | null>(null);

	const workspace = detail.data?.workspace ?? null;
	const changes = useMemo(
		() =>
			new Map<string, DraftFileChangeKind>(
				workspace?.changes.map((change) => [change.path, change.kind]) ?? [],
			),
		[workspace],
	);
	const selectedChange = selected ? changes.get(selected) : undefined;

	// Typed text must reach the Rebond before the tab closes.
	useEffect(() => {
		if (saveState === "saved") return;
		const warn = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [saveState]);

	const select = useCallback(
		(path: string | null) => {
			setSaveState("saved");
			setParams(path ? { path } : {}, { replace: true });
		},
		[setParams],
	);

	const fail = (action: string) => (error: unknown) =>
		enqueueSnackbar(`${action}: ${errorMessage(error)}`, { variant: "error" });

	/** Server-side Git actions see only what reached the worktree. */
	const flushThen = async (next: () => void) => {
		await flushRef.current?.();
		next();
	};

	if (detail.error)
		return (
			<Box sx={{ px: { xs: 2, md: 5 }, py: 4 }}>
				<Alert severity="error">Draft not found: {errorMessage(detail.error)}</Alert>
			</Box>
		);

	const data: DraftDetail | undefined = detail.data;
	const draft = data?.draft;
	const pushed = workspace?.pushedRevision ?? null;
	const upToDate =
		!!workspace && !workspace.hasUncommittedChanges && pushed === workspace.headRevision;
	const busy = saveState === "saving" || saveState === "edited";
	const blocked = saveState === "conflict" || saveState === "failed";
	const nothingToPush = upToDate && !!draft?.pullRequestNumber;
	const runnable = upToDate && !!pushed && !busy && !blocked;

	return (
		<Box
			sx={{
				px: { xs: 2, md: 5 },
				py: 3,
				display: "flex",
				flexDirection: "column",
				gap: 2,
				height: { md: "100dvh" },
			}}
		>
			<Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
				<Tooltip title="Back to drafts">
					<IconButton component={RouterLink} to="/drafts" size="small">
						<ArrowBackRoundedIcon fontSize="small" />
					</IconButton>
				</Tooltip>
				{!draft ? (
					<Skeleton width={320} height={30} sx={{ transform: "none" }} />
				) : (
					<>
						<Typography variant="h4" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
							{draft.title}
						</Typography>
						<DraftStatusChip status={draft.status} />
						<Box sx={{ flex: 1 }} />
						{isOpen && workspace && (
							<>
								{workspace.behind > 0 && (
									<Tooltip
										title={
											workspace.hasUncommittedChanges
												? "Commit pending edits first"
												: "Rebase on the latest main and force-push this branch"
										}
									>
										<span>
											<Button
												variant="outlined"
												color="inherit"
												startIcon={<SyncRoundedIcon />}
												disabled={workspace.hasUncommittedChanges || busy}
												onClick={() => setDialog("rebase")}
											>
												Update from main
											</Button>
										</span>
									</Tooltip>
								)}
								<Tooltip title={runnable ? "" : "Commit & push to run this draft"}>
									<span>
										<Button
											variant="outlined"
											color="secondary"
											startIcon={<PlayArrowRoundedIcon />}
											disabled={!runnable}
											onClick={() => setDialog("run")}
										>
											Run
										</Button>
									</span>
								</Tooltip>
								<Button
									variant="contained"
									startIcon={<CloudUploadRoundedIcon />}
									disabled={nothingToPush || blocked}
									loading={commit.isPending}
									onClick={() => void flushThen(() => setDialog("commit"))}
								>
									Commit & push
								</Button>
								<IconButton
									aria-label="More actions"
									onClick={(event) => setMenu(event.currentTarget)}
								>
									<MoreVertRoundedIcon />
								</IconButton>
								<Menu
									anchorEl={menu}
									open={menu !== null}
									onClose={() => setMenu(null)}
								>
									<MenuItem
										sx={{ color: "error.main" }}
										onClick={() => {
											setMenu(null);
											setDialog("abandon");
										}}
									>
										Abandon draft
									</MenuItem>
								</Menu>
							</>
						)}
					</>
				)}
			</Box>

			{draft && (
				<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
					<Chip
						size="small"
						variant="outlined"
						icon={<CallSplitRoundedIcon />}
						label={draft.branch}
						sx={{ color: "secondary.main", borderColor: "divider", maxWidth: "100%" }}
					/>
					{draft.pullRequestUrl && (
						<Chip
							size="small"
							variant="outlined"
							label={`pull request #${draft.pullRequestNumber}`}
							component="a"
							href={draft.pullRequestUrl}
							target="_blank"
							rel="noreferrer"
							clickable
						/>
					)}
					<ChecksChip checks={data?.checks ?? null} />
					{workspace && (
						<Typography
							sx={{ color: "text.secondary", fontFamily: fontMono, fontSize: 12 }}
						>
							{workspace.ahead} ahead, {workspace.behind} behind main
							{pushed ? `, pushed ${pushed.slice(0, 8)}` : ", not pushed yet"}
						</Typography>
					)}
				</Box>
			)}

			{draft && !isOpen && (
				<Alert severity={draft.status === "Merged" ? "success" : "info"} variant="outlined">
					{draft.status === "Merged"
						? "Merged. The Synchronisation brings its changes to the Rebond."
						: draft.status === "Closed"
							? "Its pull request was closed without merging."
							: "Abandoned."}{" "}
					{draft.pullRequestUrl && (
						<Link href={draft.pullRequestUrl} target="_blank" rel="noreferrer">
							Open the pull request
						</Link>
					)}
				</Alert>
			)}

			{isOpen && (
				<SplitPanel
					side={
						<>
							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									borderBottom: 1,
									borderColor: "divider",
									pr: 1,
								}}
							>
								<Tabs
									value={tab}
									onChange={(_, value: "files" | "changes") => setTab(value)}
									sx={{
										flex: 1,
										minHeight: 44,
										"& .MuiTab-root": { minHeight: 44 },
									}}
								>
									<Tab value="files" label="Files" />
									<Tab
										value="changes"
										label={`Changes${changes.size ? ` ${changes.size}` : ""}`}
									/>
								</Tabs>
								<Tooltip title="New file">
									<IconButton size="small" onClick={() => setDialog("create")}>
										<NoteAddOutlinedIcon fontSize="small" />
									</IconButton>
								</Tooltip>
							</Box>
							<Box sx={{ overflow: "auto", flex: 1 }}>
								{tab === "files" ? (
									files.data ? (
										<FileTree
											files={files.data}
											changes={changes}
											selected={selected}
											onSelect={select}
										/>
									) : (
										Array.from({ length: 10 }, (_, index) => (
											<Skeleton
												key={index}
												height={26}
												sx={{ mx: 2, my: 0.5, transform: "none" }}
											/>
										))
									)
								) : workspace && workspace.changes.length === 0 ? (
									<Typography
										variant="body2"
										sx={{ color: "text.secondary", px: 2, py: 2 }}
									>
										No changes yet. Edits save as you type.
									</Typography>
								) : (
									workspace?.changes.map((change) => {
										const color = changeColor(theme, change.kind);
										return (
											<Box
												key={change.path}
												component="button"
												type="button"
												onClick={() => {
													select(change.path);
													setDiff(true);
												}}
												sx={{
													appearance: "none",
													border: 0,
													width: "100%",
													display: "flex",
													gap: 1,
													alignItems: "baseline",
													px: 2,
													py: 0.9,
													textAlign: "left",
													cursor: "pointer",
													font: "inherit",
													fontFamily: fontMono,
													fontSize: 12.5,
													color: "text.primary",
													boxShadow: `inset 3px 0 0 ${color}`,
													bgcolor:
														change.path === selected
															? "action.selected"
															: "transparent",
													"&:hover": { bgcolor: "action.hover" },
												}}
											>
												<Box
													component="span"
													sx={{ color, fontWeight: 700 }}
												>
													{changeLetter[change.kind]}
												</Box>
												<Box
													component="span"
													sx={{ overflowWrap: "anywhere" }}
												>
													{change.path}
													{change.previousPath && (
														<Box
															component="span"
															sx={{
																display: "block",
																color: "text.secondary",
																fontSize: 11,
															}}
														>
															from {change.previousPath}
														</Box>
													)}
												</Box>
											</Box>
										);
									})
								)}
							</Box>
						</>
					}
				>
					{selected ? (
						<>
							<PaneBar>
								<Typography
									noWrap
									sx={{
										fontFamily: fontMono,
										fontSize: 12.5,
										flex: 1,
										color: selectedChange
											? changeColor(theme, selectedChange)
											: "text.primary",
									}}
								>
									{selected}
								</Typography>
								{selectedChange !== "Deleted" && (
									<>
										<Typography
											aria-live="polite"
											sx={{
												fontSize: 12,
												color:
													saveState === "conflict" ||
													saveState === "failed"
														? "error.main"
														: "text.secondary",
											}}
										>
											{saveLabels[saveState]}
										</Typography>
										<ToggleButtonGroup
											size="small"
											exclusive
											value={diff ? "diff" : "edit"}
											onChange={(_, value: "edit" | "diff" | null) =>
												value && setDiff(value === "diff")
											}
										>
											<ToggleButton value="edit" sx={{ px: 1.25, py: 0.25 }}>
												Edit
											</ToggleButton>
											<ToggleButton value="diff" sx={{ px: 1.25, py: 0.25 }}>
												Diff
											</ToggleButton>
										</ToggleButtonGroup>
										<Tooltip title="Rename">
											<IconButton
												size="small"
												onClick={() => setDialog("rename")}
											>
												<DriveFileRenameOutlineRoundedIcon fontSize="small" />
											</IconButton>
										</Tooltip>
										<Tooltip title="Delete">
											<IconButton
												size="small"
												onClick={() => setDialog("delete")}
											>
												<DeleteOutlineRoundedIcon fontSize="small" />
											</IconButton>
										</Tooltip>
									</>
								)}
							</PaneBar>
							{selectedChange === "Deleted" ? (
								<DeletedFileDiff draftId={id} path={selected} />
							) : (
								<DraftFileEditor
									key={selected}
									draftId={id}
									path={selected}
									diff={diff}
									flushRef={flushRef}
									onSaveState={setSaveState}
								/>
							)}
						</>
					) : (
						<EmptyState
							icon={<DescriptionOutlinedIcon />}
							title="Pick a file"
							hint="Edits save to the draft as you type. Commit & push when the change is ready for review."
						/>
					)}
				</SplitPanel>
			)}

			{draft && workspace && (
				<>
					<CommitDialog
						open={dialog === "commit"}
						branch={draft.branch}
						opensPullRequest={!draft.pullRequestNumber}
						busy={commit.isPending}
						onClose={() => setDialog(null)}
						onCommit={(message) =>
							commit.mutate(message, {
								onSuccess: (updated) => {
									setDialog(null);
									enqueueSnackbar(
										draft.pullRequestNumber
											? `Pushed to ${updated.branch}`
											: `Pushed and opened pull request #${updated.pullRequestNumber}`,
										{ variant: "success" },
									);
								},
								onError: fail("Could not push"),
							})
						}
					/>
					{pushed && (
						<DraftLaunchDialog
							draft={draft}
							revision={pushed}
							open={dialog === "run"}
							initialPlaybook={selected}
							onClose={() => setDialog(null)}
						/>
					)}
					<ConfirmDialog
						open={dialog === "rebase"}
						title="Update from main"
						action="Update"
						busy={rebase.isPending}
						onClose={() => setDialog(null)}
						onConfirm={() =>
							rebase.mutate(undefined, {
								onSuccess: () => {
									setDialog(null);
									enqueueSnackbar("Draft updated from main", {
										variant: "success",
									});
								},
								onError: (error) => {
									setDialog(null);
									fail("Could not update")(error);
								},
							})
						}
					>
						Replays this draft on the latest main
						{pushed ? " and force-pushes its branch" : ""}. If main conflicts with it,
						nothing changes and you resolve the conflict in the pull request.
					</ConfirmDialog>
					<ConfirmDialog
						open={dialog === "abandon"}
						title="Abandon draft"
						action="Abandon"
						destructive
						busy={abandon.isPending}
						onClose={() => setDialog(null)}
						onConfirm={() =>
							abandon.mutate(undefined, {
								onSuccess: () => {
									setDialog(null);
									void navigate("/drafts");
								},
								onError: fail("Could not abandon"),
							})
						}
					>
						{draft.pullRequestNumber
							? `Closes pull request #${draft.pullRequestNumber}, deletes ${draft.branch} and discards every edit.`
							: `Deletes ${draft.branch} and discards every edit.`}
					</ConfirmDialog>
					<PathDialog
						open={dialog === "create"}
						title="New file"
						action="Create"
						initialPath={
							selected?.includes("/")
								? `${selected.slice(0, selected.lastIndexOf("/") + 1)}`
								: ""
						}
						busy={createFile.isPending}
						onClose={() => setDialog(null)}
						onSubmit={(path) =>
							createFile.mutate(
								{ path, content: "", expectedHash: null },
								{
									onSuccess: () => {
										setDialog(null);
										setTab("files");
										setDiff(false);
										select(path);
									},
									onError: fail("Could not create the file"),
								},
							)
						}
					/>
					{selected && (
						<>
							<PathDialog
								open={dialog === "rename"}
								title="Rename file"
								action="Rename"
								initialPath={selected}
								busy={renameFile.isPending}
								onClose={() => setDialog(null)}
								onSubmit={(newPath) =>
									void flushThen(() =>
										renameFile.mutate(
											{ path: selected, newPath },
											{
												onSuccess: () => {
													setDialog(null);
													select(newPath);
												},
												onError: fail("Could not rename"),
											},
										),
									)
								}
							/>
							<ConfirmDialog
								open={dialog === "delete"}
								title="Delete file"
								action="Delete"
								destructive
								busy={deleteFile.isPending}
								onClose={() => setDialog(null)}
								onConfirm={() =>
									deleteFile.mutate(selected, {
										onSuccess: () => {
											setDialog(null);
											select(null);
										},
										onError: fail("Could not delete"),
									})
								}
							>
								Deletes {selected} from this draft. It stays on main until the pull
								request merges.
							</ConfirmDialog>
						</>
					)}
				</>
			)}
		</Box>
	);
}

/** A file the draft deleted: its last version on the merge base against nothing. */
function DeletedFileDiff({ draftId, path }: { draftId: string; path: string }) {
	const base = useDraftBaseFile(draftId, path, true);
	return (
		<Box sx={{ flex: 1, minHeight: 0 }}>
			<LazyCodeEditor
				modelPath={`file:///drafts/${draftId}/${path}`}
				filePath={path}
				value=""
				original={base.data?.content ?? ""}
			/>
		</Box>
	);
}
