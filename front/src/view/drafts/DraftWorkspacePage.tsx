import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
	Link as RouterLink,
	useLocation,
	useNavigate,
	useParams,
	useSearchParams,
} from "react-router";
import {
	Alert,
	Box,
	Button,
	IconButton,
	Link,
	ListItemIcon,
	ListItemText,
	Menu,
	MenuItem,
	Skeleton,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography,
	useTheme,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DnsRoundedIcon from "@mui/icons-material/DnsRounded";
import DriveFileRenameOutlineRoundedIcon from "@mui/icons-material/DriveFileRenameOutlineRounded";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
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
	useValidateDraftInventory,
	useWriteDraftFile,
} from "@/core/api/mutations";
import type {
	CommitChecks,
	DraftFileChange,
	DraftFileChangeKind,
	InventoryValidation,
} from "@/core/api/types";
import { mono } from "@/config/theme";
import { EmptyState } from "@/view/components/EmptyState";
import { changeColor, changeLetter } from "@/view/editor/changes";
import { FileTree } from "@/view/editor/FileTree";
import { languageFor } from "@/view/editor/languages";
import { LazyCodeEditor } from "@/view/editor/LazyCodeEditor";
import {
	Breadcrumbs,
	FileTabs,
	StatusBar,
	StatusItem,
	statusSpacer,
	Workbench,
	WorkbenchHeader,
} from "@/view/editor/Workbench";
import { AddHostDialog, type InventoryCheckState } from "@/view/inventory/AddHostDialog";
import { CommitComposer } from "./CommitComposer";
import { DraftFileEditor, type EditorCursor, type SaveState } from "./DraftFileEditor";
import { ConfirmDialog, PathDialog } from "./DraftDialogs";
import { DraftLaunchDialog } from "./DraftLaunchDialog";
import { DraftStatusChip } from "./DraftStatusChip";
import { InventoryCheckPanel } from "./InventoryCheckPanel";

const saveLabels: Record<SaveState, string> = {
	saved: "Saved",
	edited: "Edited",
	saving: "Saving…",
	conflict: "Conflict",
	failed: "Not saved",
};

const checkLabels: Record<CommitChecks["state"], string> = {
	None: "",
	Pending: "checks running",
	Success: "checks passed",
	Failure: "checks failed",
};

/** Branches are ansible-ui/<user>/<slug>: the status bar shows the slug, the tooltip the rest. */
const shortBranch = (branch: string) => branch.split("/").slice(2).join("/") || branch;

type Dialog = "run" | "rebase" | "abandon" | "create" | "rename" | "delete" | "addHost" | null;

/** Open tabs survive reloads within the browser tab, per Brouillon. */
function useOpenTabs(draftId: string, selected: string | null) {
	const key = `ansible-ui:draft-tabs:${draftId}`;
	const [tabs, setTabs] = useState<string[]>(() => {
		try {
			const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
			return Array.isArray(stored)
				? stored.filter((path): path is string => typeof path === "string")
				: [];
		} catch {
			return [];
		}
	});
	useEffect(() => {
		if (selected)
			setTabs((current) => (current.includes(selected) ? current : [...current, selected]));
	}, [selected]);
	useEffect(() => {
		try {
			sessionStorage.setItem(key, JSON.stringify(tabs));
		} catch {
			/* Storage may be disabled. */
		}
	}, [key, tabs]);
	return [tabs, setTabs] as const;
}

function ChangeList({
	changes,
	selected,
	onSelect,
}: {
	changes: DraftFileChange[];
	selected: string | null;
	onSelect: (path: string) => void;
}) {
	const theme = useTheme();
	if (changes.length === 0)
		return (
			<Typography variant="body2" sx={{ color: "text.secondary", px: 1.75, pb: 1.5 }}>
				No changes yet. Edits save as you type.
			</Typography>
		);
	return (
		<Box sx={{ pb: 1 }}>
			{changes.map((change) => {
				const color = changeColor(theme, change.kind);
				return (
					<Box
						key={change.path}
						component="button"
						type="button"
						title={
							change.previousPath
								? `${change.path} (from ${change.previousPath})`
								: change.path
						}
						onClick={() => onSelect(change.path)}
						sx={{
							all: "unset",
							boxSizing: "border-box",
							width: "100%",
							display: "flex",
							alignItems: "center",
							gap: 1,
							px: 1.75,
							minHeight: 28,
							cursor: "pointer",
							...mono,
							fontSize: 12.5,
							color: "text.primary",
							bgcolor: change.path === selected ? "background.raised" : "transparent",
							"&:hover": { bgcolor: "action.hover" },
						}}
					>
						<Box
							component="span"
							sx={{
								flex: 1,
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								direction: "rtl",
								textAlign: "left",
							}}
						>
							{change.path}
						</Box>
						<Box component="span" sx={{ color, fontWeight: 700, fontSize: 11.5 }}>
							{changeLetter[change.kind]}
						</Box>
					</Box>
				);
			})}
		</Box>
	);
}

function SideHeading({ children, action }: { children: string; action?: ReactNode }) {
	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "center",
				px: 1.75,
				pt: 1.25,
				pb: 0.5,
				minHeight: 34,
			}}
		>
			<Typography sx={{ flex: 1, fontSize: 12, fontWeight: 650, color: "text.secondary" }}>
				{children}
			</Typography>
			{action}
		</Box>
	);
}

export function DraftWorkspacePage() {
	const { id = "" } = useParams<{ id: string }>();
	return <DraftWorkspace key={id} id={id} />;
}

function DraftWorkspace({ id }: { id: string }) {
	const navigate = useNavigate();
	const location = useLocation();
	const { enqueueSnackbar } = useSnackbar();
	const [params, setParams] = useSearchParams();
	const selected = params.get("path");
	const diff = params.get("view") === "diff";

	const detail = useDraft(id);
	const isOpen = detail.data?.draft.status === "Open";
	const files = useDraftFiles(id, isOpen);
	const commit = useCommitDraft(id);
	const rebase = useRebaseDraft(id);
	const abandon = useAbandonDraft(id);
	const createFile = useWriteDraftFile(id);
	const renameFile = useRenameDraftFile(id);
	const deleteFile = useDeleteDraftFile(id);
	const validate = useValidateDraftInventory(id);

	const [tabs, setTabs] = useOpenTabs(id, selected);
	const [dialog, setDialog] = useState<Dialog>(null);
	const [composing, setComposing] = useState(false);
	const [menu, setMenu] = useState<HTMLElement | null>(null);
	const [saveState, setSaveState] = useState<SaveState>("saved");
	const [cursor, setCursor] = useState<EditorCursor | null>(null);
	const [check, setCheck] = useState<InventoryValidation | null>(
		() => (location.state as InventoryCheckState | null)?.validation ?? null,
	);
	const flushRef = useRef<(() => Promise<void>) | null>(null);
	// Add host lands here with the check it ran; a later navigation without state keeps the panel.
	const handoff = location.state as InventoryCheckState | null;
	const [addedHost, setAddedHost] = useState<string | null>(handoff?.host ?? null);
	useEffect(() => {
		if (!handoff) return;
		setCheck(handoff.validation);
		setAddedHost(handoff.host ?? null);
	}, [handoff]);

	const workspace = detail.data?.workspace ?? null;
	const changes = useMemo(
		() =>
			new Map<string, DraftFileChangeKind>(
				workspace?.changes.map((change) => [change.path, change.kind]) ?? [],
			),
		[workspace],
	);
	const selectedChange = selected ? changes.get(selected) : undefined;
	const inventoryChanged = [...changes.keys()].some((path) => path.startsWith("inventory/"));

	// Typed text must reach the Rebond before the tab closes.
	useEffect(() => {
		if (saveState === "saved") return;
		const warn = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [saveState]);

	const navigateTo = useCallback(
		(path: string | null, view: "edit" | "diff" = "edit") => {
			void (async () => {
				await flushRef.current?.();
				setSaveState("saved");
				setCursor(null);
				setParams(path ? (view === "diff" ? { path, view } : { path }) : {}, {
					replace: true,
				});
			})().catch((error: unknown) =>
				enqueueSnackbar(errorMessage(error), { variant: "error" }),
			);
		},
		[setParams, enqueueSnackbar],
	);

	const closeTab = (path: string) => {
		void (async () => {
			if (path === selected) await flushRef.current?.();
			const index = tabs.indexOf(path);
			const remaining = tabs.filter((tab) => tab !== path);
			setTabs(remaining);
			if (path === selected) {
				const next = remaining[Math.min(index, remaining.length - 1)];
				setParams(next ? { path: next } : {}, { replace: true });
				setSaveState("saved");
				setCursor(null);
			}
		})().catch((error: unknown) => enqueueSnackbar(errorMessage(error), { variant: "error" }));
	};

	const fail = (action: string) => (error: unknown) =>
		enqueueSnackbar(`${action}: ${errorMessage(error)}`, { variant: "error" });

	/** Server-side Git actions see only what reached the worktree. */
	const flush = useCallback(async () => {
		await flushRef.current?.();
	}, []);
	const flushThen = async (next: () => void) => {
		try {
			await flush();
			next();
		} catch (error) {
			enqueueSnackbar(errorMessage(error), { variant: "error" });
		}
	};

	const runCheck = () =>
		void flushThen(() =>
			validate.mutate(undefined, {
				onSuccess: setCheck,
				onError: fail("Could not check the inventory"),
			}),
		);

	if (detail.error)
		return (
			<Box sx={{ p: 4 }}>
				<Alert severity="error">Draft not found: {errorMessage(detail.error)}</Alert>
			</Box>
		);

	const draft = detail.data?.draft;
	const checks = detail.data?.checks ?? null;
	const pushed = workspace?.pushedRevision ?? null;
	const upToDate =
		!!workspace && !workspace.hasUncommittedChanges && pushed === workspace.headRevision;
	const busy = saveState === "saving" || saveState === "edited";
	const blocked = saveState === "conflict" || saveState === "failed";
	const nothingToPush = upToDate && !!draft?.pullRequestNumber;
	const runnable = upToDate && !!pushed && !busy && !blocked;

	const header = (
		<WorkbenchHeader
			leading={
				<Tooltip title="Back to drafts">
					<IconButton component={RouterLink} to="/drafts" size="small">
						<ArrowBackRoundedIcon fontSize="small" />
					</IconButton>
				</Tooltip>
			}
			title={draft ? draft.title : <Skeleton width={260} sx={{ transform: "none" }} />}
			badge={draft && <DraftStatusChip status={draft.status} />}
			actions={
				isOpen &&
				workspace && (
					<>
						{inventoryChanged && (
							<Button
								variant="outlined"
								color="inherit"
								startIcon={<FactCheckOutlinedIcon />}
								loading={validate.isPending}
								onClick={runCheck}
							>
								Validate inventory
							</Button>
						)}
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
									color="inherit"
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
							disabled={nothingToPush || blocked}
							onClick={() => void flushThen(() => setComposing(true))}
						>
							Commit & push
						</Button>
						<IconButton
							aria-label="More actions"
							size="small"
							onClick={(event) => setMenu(event.currentTarget)}
						>
							<MoreVertRoundedIcon fontSize="small" />
						</IconButton>
						<Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
							<MenuItem
								onClick={() => {
									setMenu(null);
									setDialog("create");
								}}
							>
								<ListItemIcon>
									<NoteAddOutlinedIcon fontSize="small" />
								</ListItemIcon>
								<ListItemText>New file</ListItemText>
							</MenuItem>
							<MenuItem
								onClick={() => {
									setMenu(null);
									setDialog("addHost");
								}}
							>
								<ListItemIcon>
									<DnsRoundedIcon fontSize="small" />
								</ListItemIcon>
								<ListItemText>Add host to inventory</ListItemText>
							</MenuItem>
							<MenuItem
								sx={{ color: "error.main" }}
								onClick={() => {
									setMenu(null);
									setDialog("abandon");
								}}
							>
								<ListItemIcon sx={{ color: "inherit" }}>
									<DeleteOutlineRoundedIcon fontSize="small" />
								</ListItemIcon>
								<ListItemText>Abandon draft</ListItemText>
							</MenuItem>
						</Menu>
					</>
				)
			}
		/>
	);

	const status = draft && (
		<StatusBar>
			<StatusItem tooltip={draft.branch}>
				⎇ <strong>{shortBranch(draft.branch)}</strong>
			</StatusItem>
			{workspace && (
				<StatusItem tone={workspace.behind > 0 ? "warning" : undefined}>
					{workspace.behind > 0
						? `${workspace.behind} behind main`
						: "up to date with main"}
				</StatusItem>
			)}
			{workspace && (
				<StatusItem>
					{workspace.changes.length}{" "}
					{workspace.changes.length === 1 ? "change" : "changes"}
					{pushed
						? upToDate
							? `, pushed ${pushed.slice(0, 8)}`
							: ", unpushed edits"
						: ", not pushed"}
				</StatusItem>
			)}
			{draft.pullRequestUrl && (
				<StatusItem href={draft.pullRequestUrl} tooltip="Open the pull request">
					PR <strong>#{draft.pullRequestNumber}</strong>
				</StatusItem>
			)}
			{checks && checks.state !== "None" && (
				<StatusItem
					tone={
						checks.state === "Success"
							? "success"
							: checks.state === "Failure"
								? "error"
								: undefined
					}
					href={checks.targetUrl ?? undefined}
				>
					{checkLabels[checks.state]}
				</StatusItem>
			)}
			{statusSpacer}
			{check && (
				<StatusItem
					tone={check.valid ? "success" : "error"}
					onClick={() => setCheck(check)}
				>
					{check.valid ? "inventory valid" : "inventory invalid"}
				</StatusItem>
			)}
			{selected && selectedChange !== "Deleted" && (
				<StatusItem
					tone={blocked ? "error" : saveState === "saved" ? "success" : undefined}
				>
					<span aria-live="polite">{saveLabels[saveState]}</span>
				</StatusItem>
			)}
			{selected && <StatusItem>{languageFor(selected)}</StatusItem>}
			{cursor && !diff && (
				<StatusItem>
					Ln {cursor.line}, Col {cursor.column}
				</StatusItem>
			)}
		</StatusBar>
	);

	const side = isOpen && (
		<>
			<SideHeading>{`Changes${changes.size ? ` · ${changes.size}` : ""}`}</SideHeading>
			{workspace ? (
				<ChangeList
					changes={workspace.changes}
					selected={selected}
					onSelect={(path) => navigateTo(path, "diff")}
				/>
			) : (
				<Skeleton height={24} sx={{ mx: 1.75, transform: "none" }} />
			)}
			<SideHeading
				action={
					<Tooltip title="New file">
						<IconButton size="small" onClick={() => setDialog("create")}>
							<NoteAddOutlinedIcon sx={{ fontSize: 17 }} />
						</IconButton>
					</Tooltip>
				}
			>
				Ansible
			</SideHeading>
			{files.data ? (
				<FileTree
					files={files.data}
					changes={changes}
					selected={selected}
					onSelect={(path) => navigateTo(path)}
				/>
			) : (
				Array.from({ length: 10 }, (_, index) => (
					<Skeleton
						key={index}
						height={22}
						sx={{ mx: 1.75, my: 0.5, transform: "none" }}
					/>
				))
			)}
		</>
	);

	return (
		<>
			<Workbench
				header={header}
				tabs={
					isOpen && (
						<FileTabs
							tabs={tabs.map((path) => ({ path, changed: changes.has(path) }))}
							active={selected}
							onSelect={(path) => navigateTo(path)}
							onClose={closeTab}
						/>
					)
				}
				side={side || undefined}
				status={status}
				overlay={
					composing &&
					draft &&
					workspace && (
						<CommitComposer
							branch={shortBranch(draft.branch)}
							changes={workspace.changes}
							opensPullRequest={!draft.pullRequestNumber}
							busy={commit.isPending}
							onClose={() => setComposing(false)}
							onCommit={(message) =>
								void flushThen(() =>
									commit.mutate(message, {
										onSuccess: (updated) => {
											setComposing(false);
											enqueueSnackbar(
												draft.pullRequestNumber
													? `Pushed to ${updated.branch}`
													: `Pushed and opened pull request #${updated.pullRequestNumber}`,
												{ variant: "success" },
											);
										},
										onError: fail("Could not push"),
									}),
								)
							}
						/>
					)
				}
			>
				{draft && !isOpen ? (
					<Box sx={{ p: 3 }}>
						<Alert
							severity={draft.status === "Merged" ? "success" : "info"}
							variant="outlined"
						>
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
					</Box>
				) : selected ? (
					<>
						<Breadcrumbs
							path={selected}
							trail={diff ? [] : (cursor?.trail ?? [])}
							actions={
								selectedChange !== "Deleted" && (
									<>
										<ToggleButtonGroup
											size="small"
											exclusive
											value={diff ? "diff" : "edit"}
											onChange={(_, value: "edit" | "diff" | null) =>
												value && navigateTo(selected, value)
											}
										>
											<ToggleButton
												value="edit"
												sx={{ px: 1.25, py: 0.1, fontSize: 12 }}
											>
												Edit
											</ToggleButton>
											<ToggleButton
												value="diff"
												sx={{ px: 1.25, py: 0.1, fontSize: 12 }}
											>
												Diff
											</ToggleButton>
										</ToggleButtonGroup>
										<Tooltip title="Rename">
											<IconButton
												size="small"
												onClick={() => setDialog("rename")}
											>
												<DriveFileRenameOutlineRoundedIcon
													sx={{ fontSize: 17 }}
												/>
											</IconButton>
										</Tooltip>
										<Tooltip title="Delete">
											<IconButton
												size="small"
												onClick={() => setDialog("delete")}
											>
												<DeleteOutlineRoundedIcon sx={{ fontSize: 17 }} />
											</IconButton>
										</Tooltip>
									</>
								)
							}
						/>
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
								onCursor={setCursor}
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
				{check && isOpen && (
					<InventoryCheckPanel
						validation={check}
						highlight={addedHost}
						busy={validate.isPending}
						onRerun={runCheck}
						onClose={() => setCheck(null)}
					/>
				)}
			</Workbench>

			{draft && workspace && (
				<>
					{pushed && (
						<DraftLaunchDialog
							draft={draft}
							revision={pushed}
							open={dialog === "run"}
							initialPlaybook={selected}
							onClose={() => setDialog(null)}
						/>
					)}
					<AddHostDialog
						open={dialog === "addHost"}
						draftId={id}
						beforeWrite={flush}
						onClose={() => setDialog(null)}
					/>
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
										navigateTo(path);
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
													setTabs((current) =>
														current.map((tab) =>
															tab === selected ? newPath : tab,
														),
													);
													navigateTo(newPath);
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
									void flushThen(() =>
										deleteFile.mutate(selected, {
											onSuccess: () => {
												setDialog(null);
												closeTab(selected);
											},
											onError: fail("Could not delete"),
										}),
									)
								}
							>
								Deletes {selected} from this draft. It stays on main until the pull
								request merges.
							</ConfirmDialog>
						</>
					)}
				</>
			)}
		</>
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
