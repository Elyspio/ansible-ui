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
import { fontMono } from "@/config/theme";
import { EmptyState } from "@/view/components/EmptyState";
import { CreateDraftDialog } from "./CreateDraftDialog";
import { DraftStatusChip } from "./DraftStatusChip";

function DraftRow({ draft, onOpen }: { draft: Draft; onOpen: () => void }) {
	return (
		<ListItemButton
			onClick={onOpen}
			sx={{ px: 1.5, py: 1.5, borderRadius: 2, gap: 2, alignItems: "center" }}
		>
			<Box sx={{ width: 104, flexShrink: 0 }}>
				<DraftStatusChip status={draft.status} />
			</Box>
			<Box sx={{ minWidth: 0, flex: 1 }}>
				<Typography noWrap sx={{ fontWeight: 600, fontSize: 14 }}>
					{draft.title}
				</Typography>
				<Typography
					noWrap
					sx={{ color: "text.secondary", fontFamily: fontMono, fontSize: 11.5 }}
				>
					{draft.branch}
				</Typography>
			</Box>
			<Box sx={{ width: 150, flexShrink: 0, textAlign: "right" }}>
				<Typography variant="body2" sx={{ color: "text.secondary" }}>
					{draft.createdBy}
				</Typography>
				<Typography sx={{ color: "text.secondary", fontFamily: fontMono, fontSize: 11 }}>
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
		<List disablePadding>
			{drafts.map((draft, index) => (
				<Box key={draft.id}>
					{index > 0 && <Divider component="li" />}
					<DraftRow draft={draft} onOpen={() => void navigate(`/drafts/${draft.id}`)} />
				</Box>
			))}
		</List>
	);

	return (
		<Box sx={{ px: { xs: 2, md: 5 }, py: 4, maxWidth: 980 }}>
			<Box sx={{ display: "flex", alignItems: "start", gap: 2, mb: 3 }}>
				<Box sx={{ flex: 1 }}>
					<Typography variant="h1">Drafts</Typography>
					<Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
						Changes to the Dépôt Ansible, each on its own branch and pull request.
					</Typography>
				</Box>
				<Button
					variant="contained"
					startIcon={<AddRoundedIcon />}
					onClick={() => setCreating(true)}
				>
					New draft
				</Button>
			</Box>

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
			{list(open)}

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
	);
}
