import type { ReactNode } from "react";
import { Box } from "@mui/material";

/** Explorer and editor side by side, framed like the Playbooks explorer. */
export function SplitPanel({ side, children }: { side: ReactNode; children: ReactNode }) {
	return (
		<Box
			sx={{
				flex: 1,
				minHeight: { xs: 560, md: 0 },
				display: "grid",
				gridTemplateColumns: { xs: "1fr", md: "300px minmax(0, 1fr)" },
				gridTemplateRows: { xs: "minmax(180px, 32vh) minmax(380px, 1fr)", md: "1fr" },
				overflow: "hidden",
				bgcolor: "background.paper",
				border: 1,
				borderColor: "divider",
				borderRadius: 3,
			}}
		>
			<Box
				sx={{
					minHeight: 0,
					display: "flex",
					flexDirection: "column",
					borderRight: { md: 1 },
					borderBottom: { xs: 1, md: 0 },
					borderColor: { xs: "divider", md: "divider" },
				}}
			>
				{side}
			</Box>
			<Box sx={{ minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
				{children}
			</Box>
		</Box>
	);
}

/** Thin bar above a pane: a label on the left, actions on the right. */
export function PaneBar({ children }: { children: ReactNode }) {
	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "center",
				gap: 1,
				px: 2,
				minHeight: 44,
				borderBottom: 1,
				borderColor: "divider",
				flexShrink: 0,
			}}
		>
			{children}
		</Box>
	);
}
