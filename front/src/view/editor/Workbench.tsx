import type { ReactNode } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { mono } from "@/config/theme";

/**
 * Editor-shaped page: header, open-file tabs, explorer and editor side by side, status bar. Fills
 * the viewport edge to edge; the editor surface, not a card, is the page.
 */
export function Workbench({
	header,
	tabs,
	side,
	status,
	overlay,
	children,
}: {
	header: ReactNode;
	tabs?: ReactNode;
	side?: ReactNode;
	status?: ReactNode;
	/** Floating layer anchored to the editor's bottom-right corner (commit composer). */
	overlay?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Box
			sx={{
				height: { md: "100dvh" },
				minHeight: { xs: "100dvh", md: 0 },
				display: "grid",
				gridTemplateRows: "auto auto minmax(0, 1fr) auto",
				bgcolor: "background.default",
			}}
		>
			{header}
			<Box>{tabs}</Box>
			<Box
				sx={{
					minHeight: 0,
					display: "grid",
					gridTemplateColumns: side ? { xs: "1fr", md: "260px minmax(0, 1fr)" } : "1fr",
					gridTemplateRows: side
						? { xs: "minmax(160px, 30vh) minmax(420px, 1fr)", md: "1fr" }
						: "1fr",
					position: "relative",
				}}
			>
				{side && (
					<Box
						component="aside"
						sx={{
							minHeight: 0,
							overflow: "auto",
							bgcolor: "background.paper",
							borderRight: { md: 1 },
							borderBottom: { xs: 1, md: 0 },
							borderColor: "divider",
						}}
					>
						{side}
					</Box>
				)}
				<Box sx={{ minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
					{children}
				</Box>
				{overlay}
			</Box>
			{status}
		</Box>
	);
}

export function WorkbenchHeader({
	leading,
	title,
	badge,
	actions,
}: {
	leading?: ReactNode;
	title: ReactNode;
	badge?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<Box
			component="header"
			sx={{
				display: "flex",
				alignItems: "center",
				flexWrap: "wrap",
				gap: 1.25,
				px: 2,
				py: 1,
				minHeight: 52,
				bgcolor: "background.paper",
				borderBottom: 1,
				borderColor: "divider",
			}}
		>
			{leading}
			<Typography
				component="h1"
				sx={{ fontSize: 15.5, fontWeight: 680, minWidth: 0, overflowWrap: "anywhere" }}
			>
				{title}
			</Typography>
			{badge}
			<Box sx={{ flex: 1 }} />
			<Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
				{actions}
			</Box>
		</Box>
	);
}

export interface FileTab {
	path: string;
	/** Amber dot: the file differs from main in this Brouillon. */
	changed?: boolean;
}

/** Open files, like an editor: the active tab sits on the editor surface with an amber top edge. */
export function FileTabs({
	tabs,
	active,
	onSelect,
	onClose,
}: {
	tabs: FileTab[];
	active: string | null;
	onSelect: (path: string) => void;
	onClose: (path: string) => void;
}) {
	if (tabs.length === 0) return null;
	return (
		<Box
			role="tablist"
			sx={{
				display: "flex",
				overflowX: "auto",
				bgcolor: "background.paper",
				borderBottom: 1,
				borderColor: "divider",
				scrollbarWidth: "none",
			}}
		>
			{tabs.map((tab) => {
				const selected = tab.path === active;
				const name = tab.path.split("/").pop();
				return (
					<Box
						key={tab.path}
						role="tab"
						aria-selected={selected}
						title={tab.path}
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 0.75,
							pl: 1.5,
							pr: 0.5,
							height: 36,
							flexShrink: 0,
							borderRight: 1,
							borderColor: "divider",
							bgcolor: selected ? "background.default" : "transparent",
							boxShadow: (theme) =>
								selected ? `inset 0 2px 0 ${theme.palette.primary.main}` : "none",
							color: selected ? "text.primary" : "text.secondary",
							"& .close": { opacity: selected ? 1 : 0 },
							"&:hover .close, & .close:focus-visible": { opacity: 1 },
						}}
					>
						<Box
							component="button"
							type="button"
							onClick={() => onSelect(tab.path)}
							onAuxClick={(event) => {
								if (event.button === 1) onClose(tab.path);
							}}
							sx={{
								all: "unset",
								cursor: "pointer",
								display: "flex",
								alignItems: "center",
								gap: 0.75,
								...mono,
								fontSize: 12.5,
							}}
						>
							{tab.changed && (
								<Box
									component="span"
									aria-label="changed"
									sx={{
										width: 7,
										height: 7,
										borderRadius: "50%",
										bgcolor: "primary.main",
									}}
								/>
							)}
							{name}
						</Box>
						<IconButton
							className="close"
							size="small"
							aria-label={`Close ${name}`}
							onClick={() => onClose(tab.path)}
							sx={{ p: 0.25 }}
						>
							<CloseRoundedIcon sx={{ fontSize: 14 }} />
						</IconButton>
					</Box>
				);
			})}
		</Box>
	);
}

/** Path of the open file, then the YAML keys around the cursor: where you are in the inventory. */
export function Breadcrumbs({
	path,
	trail = [],
	actions,
}: {
	path: string;
	trail?: string[];
	actions?: ReactNode;
}) {
	const segments = [...path.split("/"), ...trail];
	const fileIndex = path.split("/").length - 1;
	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "center",
				gap: 1,
				px: 1.75,
				minHeight: 32,
				borderBottom: 1,
				borderColor: "divider",
				bgcolor: "background.default",
				flexShrink: 0,
			}}
		>
			<Box
				component="nav"
				aria-label="Location"
				sx={{
					flex: 1,
					minWidth: 0,
					display: "flex",
					gap: 0.75,
					overflow: "hidden",
					whiteSpace: "nowrap",
					...mono,
					fontSize: 12,
					color: "text.secondary",
				}}
			>
				{segments.map((segment, index) => (
					<Box component="span" key={index} sx={{ display: "flex", gap: 0.75 }}>
						{index > 0 && <span aria-hidden>›</span>}
						<Box
							component="span"
							sx={{
								color: index === fileIndex ? "text.primary" : undefined,
								fontWeight: index === fileIndex ? 600 : 400,
							}}
						>
							{segment}
						</Box>
					</Box>
				))}
			</Box>
			{actions}
		</Box>
	);
}

export function StatusBar({ children }: { children: ReactNode }) {
	return (
		<Box
			component="footer"
			sx={{
				display: "flex",
				alignItems: "center",
				gap: 2,
				px: 1.75,
				minHeight: 28,
				overflowX: "auto",
				whiteSpace: "nowrap",
				bgcolor: "background.raised",
				borderTop: 1,
				borderColor: "divider",
				...mono,
				fontSize: 11.5,
				color: "text.secondary",
				scrollbarWidth: "none",
			}}
		>
			{children}
		</Box>
	);
}

/** One status-bar fact; `strong` text is the value, the rest is its label. */
export function StatusItem({
	children,
	tone,
	tooltip,
	href,
	onClick,
}: {
	children: ReactNode;
	tone?: "success" | "error" | "warning" | "primary";
	tooltip?: string;
	href?: string;
	onClick?: () => void;
}) {
	const interactive = !!href || !!onClick;
	const item = (
		<Box
			component={href ? "a" : onClick ? "button" : "span"}
			{...(href ? { href, target: "_blank", rel: "noreferrer" } : {})}
			{...(onClick ? { type: "button", onClick } : {})}
			sx={{
				all: interactive ? "unset" : undefined,
				cursor: interactive ? "pointer" : undefined,
				display: "inline-flex",
				alignItems: "center",
				gap: 0.75,
				color: tone ? `${tone}.main` : "inherit",
				"& strong": { color: tone ? "inherit" : "text.primary", fontWeight: 550 },
				"&:hover": interactive ? { textDecoration: "underline" } : undefined,
			}}
		>
			{children}
		</Box>
	);
	return tooltip ? <Tooltip title={tooltip}>{item}</Tooltip> : item;
}

export const statusSpacer = <Box sx={{ flex: 1 }} />;
