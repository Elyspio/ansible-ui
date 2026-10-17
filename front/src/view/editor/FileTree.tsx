import { useMemo, useState } from "react";
import { Box, useTheme } from "@mui/material";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import type { DraftFileChangeKind } from "@/core/api/types";
import { fontMono } from "@/config/theme";
import { changeColor, changeLabel, changeLetter } from "./changes";

interface Folder {
	name: string;
	path: string;
	folders: Folder[];
	files: string[];
}

function buildTree(paths: string[]): Folder {
	const root: Folder = { name: "", path: "", folders: [], files: [] };
	for (const path of paths) {
		const segments = path.split("/");
		let folder = root;
		for (const segment of segments.slice(0, -1)) {
			const folderPath = folder.path ? `${folder.path}/${segment}` : segment;
			let next = folder.folders.find((child) => child.name === segment);
			if (!next) {
				next = { name: segment, path: folderPath, folders: [], files: [] };
				folder.folders.push(next);
			}
			folder = next;
		}
		folder.files.push(path);
	}
	const sort = (folder: Folder) => {
		folder.folders.sort((a, b) => a.name.localeCompare(b.name));
		folder.files.sort((a, b) => a.localeCompare(b));
		folder.folders.forEach(sort);
	};
	sort(root);
	return root;
}

function ancestors(path: string): string[] {
	const segments = path.split("/");
	return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
}

const rowHeight = 30;

/**
 * Explorer of repository paths. Changed files carry a git-status letter and a left stripe in
 * the same color, so a Brouillon's footprint reads at a glance in the whole tree.
 */
export function FileTree({
	files,
	changes,
	selected,
	onSelect,
}: {
	files: string[];
	changes?: Map<string, DraftFileChangeKind>;
	selected: string | null;
	onSelect: (path: string) => void;
}) {
	const theme = useTheme();
	const tree = useMemo(() => buildTree(files), [files]);

	// Folders holding the selection or a change start open; everything else starts closed.
	const [toggled, setToggled] = useState<Record<string, boolean>>({});
	const autoOpen = useMemo(() => {
		const open = new Set<string>();
		for (const path of [selected, ...(changes?.keys() ?? [])])
			if (path) for (const folder of ancestors(path)) open.add(folder);
		return open;
	}, [selected, changes]);
	const isOpen = (path: string) => toggled[path] ?? autoOpen.has(path);

	const indent = (depth: number) => `${12 + depth * 14}px`;
	const row = {
		appearance: "none",
		border: 0,
		width: "100%",
		minHeight: rowHeight,
		display: "flex",
		alignItems: "center",
		gap: 0.75,
		pr: 1.5,
		textAlign: "left",
		cursor: "pointer",
		font: "inherit",
		fontFamily: fontMono,
		fontSize: 12.5,
		color: "text.primary",
		bgcolor: "transparent",
		"&:hover": { bgcolor: "action.hover" },
	} as const;

	const renderFolder = (folder: Folder, depth: number): React.ReactNode => (
		<>
			{folder.folders.map((child) => {
				const open = isOpen(child.path);
				return (
					<Box key={child.path}>
						<Box
							component="button"
							type="button"
							aria-expanded={open}
							onClick={() =>
								setToggled((current) => ({ ...current, [child.path]: !open }))
							}
							sx={[row, { pl: indent(depth), color: "text.secondary" }]}
						>
							{open ? (
								<KeyboardArrowDownRoundedIcon sx={{ fontSize: 16 }} />
							) : (
								<KeyboardArrowRightRoundedIcon sx={{ fontSize: 16 }} />
							)}
							{child.name}/
						</Box>
						{open && renderFolder(child, depth + 1)}
					</Box>
				);
			})}
			{folder.files.map((path) => {
				const kind = changes?.get(path);
				const active = path === selected;
				const color = kind ? changeColor(theme, kind) : undefined;
				return (
					<Box
						key={path}
						component="button"
						type="button"
						aria-current={active ? "true" : undefined}
						title={kind ? `${path} (${changeLabel[kind]})` : path}
						onClick={() => onSelect(path)}
						sx={[
							row,
							{
								pl: `calc(${indent(depth)} + 22px)`,
								boxShadow: color ? `inset 3px 0 0 ${color}` : "none",
								bgcolor: active ? "action.selected" : "transparent",
								fontWeight: active ? 650 : 400,
							},
						]}
					>
						<Box
							component="span"
							sx={{
								flex: 1,
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								color: color ?? "inherit",
							}}
						>
							{path.split("/").pop()}
						</Box>
						{kind && (
							<Box component="span" sx={{ color, fontWeight: 700, fontSize: 11 }}>
								{changeLetter[kind]}
							</Box>
						)}
					</Box>
				);
			})}
		</>
	);

	return <Box sx={{ py: 0.5 }}>{renderFolder(tree, 0)}</Box>;
}
