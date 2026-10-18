import { useState } from "react";
import { useNavigate } from "react-router";
import {
	Alert,
	Box,
	Button,
	Divider,
	List,
	ListItemButton,
	Skeleton,
	Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import { useDrafts } from "@/core/api/queries";
import type { Draft } from "@/core/api/types";
import { formatRelative } from "@/core/format";
import { mono } from "@/config/theme";
import { EmptyState } from "@/view/components/EmptyState";
import { CreateDraftDialog } from "./CreateDraftDialog";
import { DraftStatusChip } from "./DraftStatusChip";
import { WorkbenchHeader } from "@/view/editor/Workbench";

function DraftRow({ draft, onOpen }: { draft: Draft; onOpen: () => void }) {
	return (
		<ListItemButton
			onClick={onOpen}
			sx={{
				px: 2,
				py: 2,
				gap: 2,
				alignItems: "center",
				flexWrap: { xs: "wrap", sm: "nowrap" },
				borderLeft: 2,
				borderColor: draft.status === "Open" ? "primary.main" : "transparent",
			}}
		>
			<Box sx={{ width: 104, flexShrink: 0 }}>
				<DraftStatusChip status={draft.status} />
			</Box>
			<Box sx={{ minWidth: 100, flex: 1 }}>
				<Typography noWrap sx={{ fontWeight: 600, fontSize: 14 }}>
					{draft.title}
				</Typography>
				<Typography noWrap sx={{ color: "text.secondary", ...mono, fontSize: 11.5 }}>
					{draft.branch}
				</Typography>
			</Box>
			<Box sx={{ width: { xs: "100%", sm: 150 }, flexShrink: 0, textAlign: "right" }}>
				<Typography variant="body2" sx={{ color: "text.secondary" }}>
					{draft.createdBy}
				</Typography>
				<Typography sx={{ color: "text.secondary", ...mono, fontSize: 11 }}>
					{draft.pullRequestNumber ? `#${draft.pullRequestNumber}, ` : ""}
					{formatRelative(draft.updatedAt)}
				</Typography>
			</Box>
		</ListItemButton>
	);
}

export function DraftsPage() {
	const navigate = useNavigate();
	const { data, isPending, error } = useDrafts();
	const [creating, setCreating] = useState(false);
	const open = data?.filter((draft) => draft.status === "Open") ?? [];
	const closed = data?.filter((draft) => draft.status !== "Open") ?? [];

	const list = (drafts: Draft[]) => (
		<List
			component="div"
			disablePadding
			sx={{
				border: 1,
				borderColor: "divider",
				borderRadius: 1,
				overflow: "hidden",
				bgcolor: "background.paper",
			}}
		>
			{drafts.map((draft, index) => (
				<Box key={draft.id}>
					{index > 0 && <Divider />}
					<DraftRow draft={draft} onOpen={() => void navigate(`/drafts/${draft.id}`)} />
				</Box>
			))}
		</List>
	);

	return (
		<Box>
			<WorkbenchHeader
				title="Drafts"
				actions={
					<Button
						variant="contained"
						startIcon={<AddRoundedIcon />}
						onClick={() => setCreating(true)}
					>
						New draft
					</Button>
				}
			/>
			<Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1100 }}>
				<Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
					Changes to the Dépôt Ansible, each on its own branch and pull request.
				</Typography>

				{error && <Alert severity="error">Could not load drafts: {error.message}</Alert>}
				{isPending &&
					Array.from({ length: 4 }, (_, i) => (
						<Skeleton key={i} height={64} sx={{ transform: "none", mb: 1 }} />
					))}

				{data && open.length === 0 && (
					<EmptyState
						icon={<EditNoteRoundedIcon />}
						title="No open drafts"
						hint="Start one here or from a file in Files. It stays private to its branch until you push."
						action={
							<Button variant="outlined" onClick={() => setCreating(true)}>
								New draft
							</Button>
						}
					/>
				)}
				{open.length > 0 && (
					<>
						<Typography variant="h5" sx={{ mb: 1.5 }}>
							Open{" "}
							<Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
								{open.length}
							</Box>
						</Typography>
						{list(open)}
					</>
				)}

				{closed.length > 0 && (
					<>
						<Typography variant="h5" sx={{ mt: 5, mb: 1 }}>
							Closed
						</Typography>
						{list(closed)}
					</>
				)}

				<CreateDraftDialog open={creating} onClose={() => setCreating(false)} />
			</Box>
		</Box>
	);
}
