import type { Theme } from "@mui/material";
import type { DraftFileChangeKind } from "@/core/api/types";

export const changeLetter: Record<DraftFileChangeKind, string> = {
	Added: "A",
	Modified: "M",
	Deleted: "D",
	Renamed: "R",
};

export const changeLabel: Record<DraftFileChangeKind, string> = {
	Added: "added",
	Modified: "modified",
	Deleted: "deleted",
	Renamed: "renamed",
};

/** Git-status colors, shared by the tree stripe, the change list and the diff gutter. */
export function changeColor(theme: Theme, kind: DraftFileChangeKind): string {
	const dark = theme.palette.mode === "dark";
	const colors: Record<DraftFileChangeKind, string> = {
		Added: theme.palette.success.main,
		Modified: dark ? "#fbbf24" : "#b45309",
		Deleted: theme.palette.error.main,
		Renamed: dark ? "#a78bfa" : "#7c3aed",
	};
	return colors[kind];
}
