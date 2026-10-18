import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import type { InventoryValidation } from "@/core/api/types";
import { terminal } from "@/config/theme";

/**
 * Output panel under the editor: the Brouillon's inventory as Ansible parsed it (groups and hosts,
 * never vars), or a safe parse failure message. `highlight` marks the host just added.
 */
export function InventoryCheckPanel({
	validation,
	highlight,
	busy,
	onRerun,
	onClose,
}: {
	validation: InventoryValidation;
	highlight?: string | null;
	busy: boolean;
	onRerun: () => void;
	onClose: () => void;
}) {
	const groups = validation.groups.filter(
		(group) => group.hosts.length > 0 || group.children.length > 0,
	);
	return (
		<Box
			component="section"
			aria-label="Inventory check"
			sx={{
				flexShrink: 0,
				maxHeight: "38%",
				display: "flex",
				flexDirection: "column",
				borderTop: 1,
				borderColor: "divider",
				bgcolor: terminal.background,
				color: terminal.text,
			}}
		>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 1,
					px: 1.75,
					minHeight: 32,
					borderBottom: `1px solid ${terminal.border}`,
				}}
			>
				<Typography
					sx={{
						fontSize: 12.5,
						fontWeight: 600,
						color: validation.valid ? "success.main" : "error.main",
					}}
				>
					{validation.valid
						? `Inventory parses: ${validation.hosts.length} hosts in ${groups.length} groups`
						: "Inventory validation failed"}
				</Typography>
				<Box sx={{ flex: 1 }} />
				<Tooltip title="Check again">
					<span>
						<IconButton
							size="small"
							disabled={busy}
							onClick={onRerun}
							sx={{ color: terminal.muted }}
						>
							<RefreshRoundedIcon sx={{ fontSize: 16 }} />
						</IconButton>
					</span>
				</Tooltip>
				<IconButton
					size="small"
					aria-label="Close inventory check"
					onClick={onClose}
					sx={{ color: terminal.muted }}
				>
					<CloseRoundedIcon sx={{ fontSize: 16 }} />
				</IconButton>
			</Box>
			<Box
				sx={{
					overflow: "auto",
					px: 1.75,
					py: 1,
					fontFamily: terminal.fontFamily,
					fontVariationSettings: terminal.fontVariationSettings,
					fontSize: 12.5,
					lineHeight: 1.7,
					whiteSpace: "pre-wrap",
				}}
			>
				{validation.valid ? (
					groups.map((group) => (
						<Box key={group.name}>
							<Box component="span" sx={{ color: "#f3c37e" }}>
								{group.name}
							</Box>
							{group.children.length > 0 && (
								<Box component="span" sx={{ color: terminal.muted }}>
									{"  "}› {group.children.join(", ")}
								</Box>
							)}
							{group.hosts.length > 0 && (
								<Box sx={{ pl: 2.5 }}>
									{group.hosts.map((host, index) => (
										<Box
											component="span"
											key={host}
											sx={
												host === highlight
													? { color: "primary.main", fontWeight: 600 }
													: undefined
											}
										>
											{index > 0 && (
												<Box
													component="span"
													sx={{ color: terminal.muted }}
												>
													,{" "}
												</Box>
											)}
											{host}
										</Box>
									))}
								</Box>
							)}
						</Box>
					))
				) : (
					<Box component="span" sx={{ color: "error.main" }}>
						{validation.error}
					</Box>
				)}
			</Box>
		</Box>
	);
}
