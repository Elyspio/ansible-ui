import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

export function EmptyState({
	icon,
	title,
	hint,
	action,
}: {
	icon: ReactNode;
	title: string;
	hint?: string;
	action?: ReactNode;
}) {
	return (
		<Box
			sx={{
				display: "grid",
				gap: 1,
				justifyItems: "center",
				py: 10,
				px: 2,
				textAlign: "center",
				color: "text.secondary",
			}}
		>
			<Box sx={{ opacity: 0.55, "& svg": { fontSize: 36 } }}>{icon}</Box>
			<Typography variant="h5" color="text.primary">
				{title}
			</Typography>
			{hint && (
				<Typography variant="body2" sx={{ maxWidth: "48ch" }}>
					{hint}
				</Typography>
			)}
			{action && <Box sx={{ mt: 1 }}>{action}</Box>}
		</Box>
	);
}
