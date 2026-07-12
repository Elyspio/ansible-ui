import { Box, Typography } from "@mui/material";
import { fontMono } from "@/config/theme";
import type { HostRecap } from "@/core/api/types";

/** Compact aggregate of the PLAY RECAP: totals across hosts, colored by severity. */
export function RecapBadges({ recap }: { recap: HostRecap[] }) {
	if (recap.length === 0) return null;

	const total = recap.reduce(
		(acc, host) => ({
			changed: acc.changed + host.changed,
			failed: acc.failed + host.failed,
			unreachable: acc.unreachable + host.unreachable,
		}),
		{ changed: 0, failed: 0, unreachable: 0 },
	);

	const parts: { label: string; color: string }[] = [
		{ label: `${recap.length} host${recap.length > 1 ? "s" : ""}`, color: "text.secondary" },
	];
	if (total.changed > 0) parts.push({ label: `${total.changed} changed`, color: "warning.main" });
	if (total.failed > 0) parts.push({ label: `${total.failed} failed`, color: "error.main" });
	if (total.unreachable > 0)
		parts.push({ label: `${total.unreachable} unreachable`, color: "error.main" });
	if (total.changed === 0 && total.failed === 0 && total.unreachable === 0)
		parts.push({ label: "no change", color: "success.main" });

	return (
		<Box sx={{ display: "flex", gap: 1.25, alignItems: "baseline", flexWrap: "wrap" }}>
			{parts.map((part) => (
				<Typography
					key={part.label}
					component="span"
					sx={{
						fontFamily: fontMono,
						fontSize: 11.5,
						color: part.color,
						whiteSpace: "nowrap",
					}}
				>
					{part.label}
				</Typography>
			))}
		</Box>
	);
}
