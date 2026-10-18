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
	const colors: Record<DraftFileChangeKind, string> = {
		Added: theme.palette.success.main,
		Modified: theme.palette.primary.main,
		Deleted: theme.palette.error.main,
		Renamed: theme.palette.info.main,
	};
	return colors[kind];
}
