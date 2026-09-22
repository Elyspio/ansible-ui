import { Box, CircularProgress, Typography } from "@mui/material";

export function Splash({
	title,
	subtitle,
	loading = true,
}: {
	title: string;
	subtitle?: string;
	loading?: boolean;
}) {
	return (
		<Box
			sx={{
				minHeight: "100dvh",
				display: "grid",
				placeItems: "center",
				bgcolor: "background.default",
			}}
		>
			<Box
				sx={{
					display: "grid",
					gap: 1.5,
					justifyItems: "center",
					px: 2,
					textAlign: "center",
				}}
			>
				{loading && <CircularProgress size={22} thickness={5} />}
				<Typography variant="h5">{title}</Typography>
				{subtitle && (
					<Typography
						variant="body2"
						sx={{
							color: "text.secondary",
						}}
					>
						{subtitle}
					</Typography>
				)}
			</Box>
		</Box>
	);
}
