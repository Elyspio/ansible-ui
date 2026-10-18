import { Box, Chip, useTheme } from "@mui/material";
import type { DraftStatus } from "@/core/api/types";

const labels: Record<DraftStatus, string> = {
	Open: "open",
	Merged: "merged",
	Closed: "closed",
	Abandoned: "abandoned",
};

/** Amber marks unmerged code everywhere in the app; green is what main runs. */
export function DraftStatusChip({ status }: { status: DraftStatus }) {
	const theme = useTheme();
	const colors: Record<DraftStatus, string> = {
		Open: theme.palette.primary.main,
		Merged: theme.palette.success.main,
		Closed: theme.palette.text.secondary,
		Abandoned: theme.palette.text.secondary,
	};
	const color = colors[status];
	return (
		<Chip
			size="small"
			variant="outlined"
			label={labels[status]}
			icon={
				<Box
					component="span"
					sx={{
						width: 7,
						height: 7,
						ml: "6px !important",
						borderRadius: "2px",
						bgcolor: color,
					}}
				/>
			}
			sx={{ color, borderColor: "divider", bgcolor: "transparent" }}
		/>
	);
}
