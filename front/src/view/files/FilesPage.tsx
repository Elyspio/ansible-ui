import { useState } from "react";
import { useSearchParams } from "react-router";
import { Alert, Box, Button, Skeleton, Typography } from "@mui/material";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import { useMe, usePublishedFile, usePublishedFiles } from "@/core/api/queries";
import { fontMono } from "@/config/theme";
import { EmptyState } from "@/view/components/EmptyState";
import { CreateDraftDialog } from "@/view/drafts/CreateDraftDialog";
import { FileNotice } from "@/view/editor/FileNotice";
import { FileTree } from "@/view/editor/FileTree";
import { LazyCodeEditor } from "@/view/editor/LazyCodeEditor";
import { PaneBar, SplitPanel } from "@/view/editor/SplitPanel";

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
		<Box
			sx={{
				px: { xs: 2, md: 5 },
				py: 3,
				display: "flex",
				flexDirection: "column",
				gap: 2.5,
				height: { md: "100dvh" },
			}}
		>
			<Box sx={{ display: "flex", alignItems: "start", gap: 2, flexWrap: "wrap" }}>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography variant="h1">Files</Typography>
					<Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
						The Dépôt Ansible at Révision distante{" "}
						<Box component="span" sx={{ fontFamily: fontMono }}>
							{revision?.slice(0, 8) ?? "…"}
						</Box>
						, read-only.
					</Typography>
				</Box>
				{me.data?.canEdit && (
					<Button
						variant="contained"
						startIcon={<EditNoteRoundedIcon />}
						onClick={() => setCreating(true)}
					>
						{selected ? "Edit in a draft" : "New draft"}
					</Button>
				)}
			</Box>

			{files.error && (
				<Alert severity="error">Could not list files: {files.error.message}</Alert>
			)}

			<SplitPanel
				side={
					<Box sx={{ overflow: "auto", flex: 1 }}>
						{files.isPending &&
							Array.from({ length: 10 }, (_, index) => (
								<Skeleton
									key={index}
									height={26}
									sx={{ mx: 2, transform: "none", my: 0.5 }}
								/>
							))}
						{files.data && (
							<FileTree
								files={files.data.files}
								selected={selected}
								onSelect={select}
							/>
						)}
					</Box>
				}
			>
				{selected && file.data ? (
					<>
						<PaneBar>
							<Typography
								noWrap
								sx={{ fontFamily: fontMono, fontSize: 12.5, flex: 1 }}
							>
								{selected}
							</Typography>
						</PaneBar>
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
			</SplitPanel>

			<CreateDraftDialog
				open={creating}
				initialTitle={selected ? `Update ${selected.split("/").pop()}` : ""}
				openPath={selected}
				onClose={() => setCreating(false)}
			/>
		</Box>
	);
}
