import { Link as RouterLink } from "react-router";
import { Chip } from "@mui/material";
import CallSplitRoundedIcon from "@mui/icons-material/CallSplitRounded";
import type { DraftRunSource } from "@/core/api/types";

/** Marks a Run de brouillon: unmerged code, frozen at one pushed commit. */
export function DraftRunChip({ draft, link = true }: { draft: DraftRunSource; link?: boolean }) {
	const label = `draft ${draft.branch} @ ${draft.revision.slice(0, 8)}`;
	const sx = { color: "secondary.main", borderColor: "secondary.main", maxWidth: "100%" };
	return link ? (
		<Chip
			size="small"
			variant="outlined"
			icon={<CallSplitRoundedIcon />}
			label={label}
			component={RouterLink}
			to={`/drafts/${draft.draftId}`}
			clickable
			sx={sx}
		/>
	) : (
		<Chip
			size="small"
			variant="outlined"
			icon={<CallSplitRoundedIcon />}
			label={label}
			sx={sx}
		/>
	);
}
