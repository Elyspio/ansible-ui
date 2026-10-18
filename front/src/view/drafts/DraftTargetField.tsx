import { FormControlLabel, MenuItem, Radio, RadioGroup, TextField, Box } from "@mui/material";
import { useDrafts } from "@/core/api/queries";

/** Where a shortcut writes its change: a new Brouillon, or one already open. */
export type DraftTarget = { kind: "new"; title: string } | { kind: "draft"; id: string };

/** Title for a new Brouillon: what was typed, else the suggestion shown as placeholder. */
export function draftTitle(target: DraftTarget, suggestion: string): string {
	return target.kind === "new" ? target.title.trim() || suggestion.trim() : "";
}

export function targetReady(target: DraftTarget, suggestion = ""): boolean {
	return target.kind === "new" ? draftTitle(target, suggestion).length > 0 : target.id.length > 0;
}

export function DraftTargetField({
	value,
	onChange,
	suggestedTitle,
}: {
	value: DraftTarget;
	onChange: (target: DraftTarget) => void;
	suggestedTitle?: string;
}) {
	const drafts = useDrafts();
	const open = drafts.data?.filter((draft) => draft.status === "Open") ?? [];
	return (
		<RadioGroup
			value={value.kind}
			onChange={(_, kind) =>
				onChange(
					kind === "new"
						? { kind: "new", title: "" }
						: { kind: "draft", id: open[0]?.id ?? "" },
				)
			}
			sx={{ gap: 1 }}
		>
			<Box
				sx={{
					display: "grid",
					gridTemplateColumns: "auto 1fr",
					alignItems: "center",
					gap: 1,
				}}
			>
				<FormControlLabel value="new" control={<Radio size="small" />} label="New draft" />
				{value.kind === "new" && (
					<TextField
						fullWidth
						label="Title"
						slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: 120 } }}
						value={value.title}
						placeholder={suggestedTitle}
						onChange={(event) => onChange({ kind: "new", title: event.target.value })}
					/>
				)}
			</Box>
			<Box
				sx={{
					display: "grid",
					gridTemplateColumns: "auto 1fr",
					alignItems: "center",
					gap: 1,
				}}
			>
				<FormControlLabel
					value="draft"
					disabled={open.length === 0}
					control={<Radio size="small" />}
					label={open.length === 0 ? "Open draft (none yet)" : "Open draft"}
				/>
				{value.kind === "draft" && (
					<TextField
						select
						fullWidth
						label="Draft"
						value={value.id}
						onChange={(event) => onChange({ kind: "draft", id: event.target.value })}
					>
						{open.map((draft) => (
							<MenuItem key={draft.id} value={draft.id}>
								{draft.title}
							</MenuItem>
						))}
					</TextField>
				)}
			</Box>
		</RadioGroup>
	);
}
