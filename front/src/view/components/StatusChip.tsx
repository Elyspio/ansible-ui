import { Box, Chip, keyframes, useTheme } from "@mui/material";
import type { RunStatus } from "@/core/api/types";

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.8); }
`;

const labels: Record<RunStatus, string> = {
	Queued: "queued",
	Running: "running",
	Succeeded: "succeeded",
	Failed: "failed",
	Canceled: "canceled",
	Interrupted: "interrupted",
};

export function StatusChip({ status }: { status: RunStatus }) {
	const theme = useTheme();
	const colors: Record<RunStatus, string> = {
		Queued: theme.palette.text.secondary,
		Running: theme.palette.primary.main,
		Succeeded: theme.palette.success.main,
		Failed: theme.palette.error.main,
		Canceled: theme.palette.warning.main,
		Interrupted: theme.palette.warning.main,
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
						borderRadius: "50%",
						bgcolor: color,
						animation:
							status === "Running" ? `${pulse} 1.6s ease-in-out infinite` : "none",
					}}
				/>
			}
			sx={{ color, borderColor: "divider", bgcolor: "transparent" }}
		/>
	);
}
