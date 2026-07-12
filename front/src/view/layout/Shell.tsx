import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
	Box,
	Divider,
	IconButton,
	List,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	Tooltip,
	Typography,
} from "@mui/material";
import TerminalRoundedIcon from "@mui/icons-material/TerminalRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import DnsRoundedIcon from "@mui/icons-material/DnsRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import { appVersion } from "@/config/runtime";
import { fontMono, type Mode } from "@/config/theme";
import { useAuth } from "@/core/auth/useAuth";
import { RepositoryStatusPanel } from "./RepositoryStatusPanel";

const NAV = [
	{ to: "/", label: "Playbooks", icon: <PlayArrowRoundedIcon /> },
	{ to: "/runs", label: "History", icon: <HistoryRoundedIcon /> },
	{ to: "/inventory", label: "Inventory", icon: <DnsRoundedIcon /> },
];

const SIDEBAR_WIDTH = 216;

export function Shell({
	mode,
	onToggleMode,
	children,
}: {
	mode: Mode;
	onToggleMode: () => void;
	children: ReactNode;
}) {
	const { user } = useAuth();
	const { pathname } = useLocation();

	return (
		<Box sx={{ display: "flex", minHeight: "100dvh" }}>
			<Box
				component="nav"
				sx={{
					width: SIDEBAR_WIDTH,
					flexShrink: 0,
					display: { xs: "none", md: "flex" },
					flexDirection: "column",
					borderRight: 1,
					borderColor: "divider",
					position: "sticky",
					top: 0,
					height: "100dvh",
				}}
			>
				<Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 2.5, py: 2.5 }}>
					<TerminalRoundedIcon sx={{ color: "primary.main" }} />
					<Typography sx={{ fontFamily: fontMono, fontWeight: 600, fontSize: 15 }}>
						ansible-ui
					</Typography>
				</Box>

				<List sx={{ px: 1.25, display: "grid", gap: 0.25 }}>
					{NAV.map((item) => {
						const selected =
							item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
						return (
							<ListItemButton
								key={item.to}
								component={NavLink}
								to={item.to}
								selected={selected}
								sx={{
									borderRadius: 2,
									minHeight: 38,
									"&.Mui-selected": { bgcolor: "action.selected" },
								}}
							>
								<ListItemIcon sx={{ minWidth: 34, "& svg": { fontSize: 20 } }}>
									{item.icon}
								</ListItemIcon>
								<ListItemText
									primary={item.label}
									slotProps={{
										primary: {
											sx: {
												fontSize: 13.5,
												fontWeight: selected ? 600 : 500,
											},
										},
									}}
								/>
							</ListItemButton>
						);
					})}
				</List>

				<Box sx={{ flex: 1 }} />
				<RepositoryStatusPanel />

				<Divider />
				<Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.5 }}>
					<Box sx={{ minWidth: 0, flex: 1 }}>
						<Typography noWrap sx={{ fontSize: 12.5, fontWeight: 600 }}>
							{user.name}
						</Typography>
						<Typography
							noWrap
							sx={{ fontFamily: fontMono, fontSize: 10.5 }}
							color="text.secondary"
						>
							{appVersion}
						</Typography>
					</Box>
					<Tooltip title={mode === "dark" ? "Light mode" : "Dark mode"}>
						<IconButton size="small" onClick={onToggleMode}>
							{mode === "dark" ? (
								<LightModeRoundedIcon fontSize="small" />
							) : (
								<DarkModeRoundedIcon fontSize="small" />
							)}
						</IconButton>
					</Tooltip>
				</Box>
			</Box>

			<Box
				component="main"
				sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}
			>
				{children}
			</Box>
		</Box>
	);
}
