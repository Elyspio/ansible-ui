import { useEffect, useRef, useState } from "react";
import { Box, Button, ClickAwayListener, InputBase, Paper, useTheme } from "@mui/material";
import type { DraftFileChange } from "@/core/api/types";
import { mono } from "@/config/theme";
import { changeColor, changeLetter } from "@/view/editor/changes";

const kbd = {
	...mono,
	fontSize: 11,
	px: 0.6,
	py: 0.1,
	border: 1,
	borderColor: "divider",
	borderRadius: 0.5,
	color: "text.secondary",
} as const;

/**
 * Commit message composer docked above the status bar, like an editor's source-control input:
 * the files it commits stay visible above the message, Ctrl+Enter pushes, Escape keeps editing.
 */
export function CommitComposer({
	branch,
	changes,
	opensPullRequest,
	busy,
	onClose,
	onCommit,
}: {
	branch: string;
	changes: DraftFileChange[];
	opensPullRequest: boolean;
	busy: boolean;
	onClose: () => void;
	onCommit: (message: string) => void;
}) {
	const theme = useTheme();
	const [message, setMessage] = useState("");
	const input = useRef<HTMLTextAreaElement>(null);
	const subject = message.split("\n")[0].trim();
	const ready = !!message.trim() && !busy;

	useEffect(() => input.current?.focus(), []);

	const submit = () => {
		if (ready) onCommit(message.trim());
	};

	return (
		<ClickAwayListener onClickAway={() => !busy && !message.trim() && onClose()}>
			<Paper
				role="dialog"
				aria-label="Commit and push"
				elevation={0}
				onKeyDown={(event) => {
					if (event.key === "Escape" && !busy) onClose();
					if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
						event.preventDefault();
						submit();
					}
				}}
				sx={{
					position: "absolute",
					right: 16,
					bottom: 12,
					zIndex: 5,
					width: "min(540px, calc(100% - 32px))",
					border: 1,
					borderColor: "divider",
					boxShadow: `0 18px 50px rgba(0,0,0,${theme.palette.mode === "dark" ? 0.55 : 0.18})`,
				}}
			>
				<Box
					sx={{
						px: 2,
						py: 1.25,
						borderBottom: 1,
						borderColor: "divider",
						...mono,
						fontSize: 12,
						color: "text.secondary",
						display: "grid",
						gap: 0.5,
					}}
				>
					<Box>
						Commit {changes.length} {changes.length === 1 ? "change" : "changes"} to{" "}
						<Box component="span" sx={{ color: "text.primary" }}>
							{branch}
						</Box>
					</Box>
					<Box
						sx={{
							display: "flex",
							flexWrap: "wrap",
							columnGap: 2,
							rowGap: 0.25,
							maxHeight: 72,
							overflow: "auto",
						}}
					>
						{changes.map((change) => (
							<Box component="span" key={change.path} sx={{ whiteSpace: "nowrap" }}>
								<Box
									component="span"
									sx={{ color: changeColor(theme, change.kind), fontWeight: 700 }}
								>
									{changeLetter[change.kind]}
								</Box>{" "}
								{change.path}
							</Box>
						))}
					</Box>
				</Box>
				<Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
					<InputBase
						inputRef={input}
						multiline
						minRows={2}
						maxRows={8}
						fullWidth
						placeholder="Describe the change, e.g. Add host backup-pbs-unifi.elylan"
						value={message}
						onChange={(event) => setMessage(event.target.value)}
						inputProps={{ maxLength: 4000, "aria-label": "Commit message" }}
						sx={{ fontSize: 15, lineHeight: 1.5 }}
					/>
					<Box sx={{ display: "flex", fontSize: 12, color: "text.secondary", mt: 0.5 }}>
						<Box sx={{ flex: 1 }}>
							{opensPullRequest
								? "First push opens the pull request into main."
								: "Updates the open pull request."}
						</Box>
						<Box
							component="span"
							sx={{
								...mono,
								color: subject.length > 72 ? "warning.main" : undefined,
							}}
							aria-label="Subject length"
						>
							{subject.length}/72
						</Box>
					</Box>
				</Box>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1,
						px: 2,
						py: 1,
						borderTop: 1,
						borderColor: "divider",
						fontSize: 12,
						color: "text.secondary",
					}}
				>
					<Box component="kbd" sx={kbd}>
						Esc
					</Box>
					keep editing
					<Box sx={{ flex: 1 }} />
					<Box component="kbd" sx={kbd}>
						Ctrl
					</Box>
					<Box component="kbd" sx={kbd}>
						Enter
					</Box>
					<Button
						variant="contained"
						size="small"
						disabled={!ready}
						loading={busy}
						onClick={submit}
					>
						Commit & push
					</Button>
				</Box>
			</Paper>
		</ClickAwayListener>
	);
}
