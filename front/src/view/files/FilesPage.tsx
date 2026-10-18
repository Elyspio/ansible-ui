import { useState } from "react";
import { useSearchParams } from "react-router";
import { Alert, Box, Button, Skeleton, Typography } from "@mui/material";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import { useMe, usePublishedFile, usePublishedFiles } from "@/core/api/queries";
import { EmptyState } from "@/view/components/EmptyState";
import { CreateDraftDialog } from "@/view/drafts/CreateDraftDialog";
import { FileNotice } from "@/view/editor/FileNotice";
import { FileTree } from "@/view/editor/FileTree";
import { LazyCodeEditor } from "@/view/editor/LazyCodeEditor";
import {
	Breadcrumbs,
	FileTabs,
	StatusBar,
	StatusItem,
	Workbench,
	WorkbenchHeader,
} from "@/view/editor/Workbench";

/** Read-only Dépôt Ansible at the Révision distante; editors start a draft from here. */
export function FilesPage() {
	const me = useMe();
	const files = usePublishedFiles();
	const [params, setParams] = useSearchParams();
	const selected = params.get("path");
	const revision = files.data?.revision;
	const file = usePublishedFile(revision, selected);
	const [creating, setCreating] = useState(false);

	const select = (path: string) => setParams({ path }, { replace: true });

	return (
		<Workbench
			header={
				<WorkbenchHeader
					title="Files"
					badge={
						<Typography sx={{ color: "text.secondary", fontSize: 12 }}>
							Dépôt Ansible
						</Typography>
					}
					actions={
						me.data?.canEdit && (
							<Button
								variant="contained"
								startIcon={<EditNoteRoundedIcon />}
								onClick={() => setCreating(true)}
							>
								{selected ? "Edit in a draft" : "New draft"}
							</Button>
						)
					}
				/>
			}
			tabs={
				selected && (
					<FileTabs
						tabs={[{ path: selected }]}
						active={selected}
						onSelect={select}
						onClose={() => setParams({}, { replace: true })}
					/>
				)
			}
			status={
				<StatusBar>
					<StatusItem>
						Révision distante <strong>{revision?.slice(0, 8) ?? "…"}</strong>
					</StatusItem>
					<StatusItem>Read-only</StatusItem>
					<StatusItem>
						<strong>{files.data?.files.length ?? 0}</strong> files
					</StatusItem>
				</StatusBar>
			}
			side={
				<>
					<Typography sx={{ px: 1.75, py: 1.5, fontSize: 12, color: "text.secondary" }}>
						Files at Révision distante
					</Typography>
					{files.isPending &&
						Array.from({ length: 10 }, (_, index) => (
							<Skeleton key={index} height={26} sx={{ mx: 2 }} />
						))}
					{files.data && (
						<FileTree files={files.data.files} selected={selected} onSelect={select} />
					)}
				</>
			}
		>
			{files.error && (
				<Alert severity="error">Could not list files: {files.error.message}</Alert>
			)}

			{selected && file.data ? (
				<>
					<Breadcrumbs path={selected} />
					<FileNotice file={file.data} />
					{file.data.content !== null && (
						<Box sx={{ flex: 1, minHeight: 0 }}>
							<LazyCodeEditor
								modelPath={`file:///published/${revision}/${selected}`}
								filePath={selected}
								value={file.data.content}
								readOnly
							/>
						</Box>
					)}
				</>
			) : file.error ? (
				<Alert severity="error" sx={{ m: 2 }}>
					Could not read {selected}: {file.error.message}
				</Alert>
			) : (
				<EmptyState
					icon={<DescriptionOutlinedIcon />}
					title={selected ? "Opening…" : "Pick a file"}
					hint={
						selected
							? undefined
							: "Browse the Dépôt Ansible as the Rebond runs it. Changes go through a draft."
					}
				/>
			)}

			<CreateDraftDialog
				open={creating}
				initialTitle={selected ? `Update ${selected.split("/").pop()}` : ""}
				openPath={selected}
				onClose={() => setCreating(false)}
			/>
		</Workbench>
	);
}
