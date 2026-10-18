import { useState, type ReactNode } from "react";
import {
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	TextField,
	Typography,
} from "@mui/material";

/** Asks for a path relative to the Ansible directory (new file, rename). */
export function PathDialog({
	open,
	title,
	action,
	initialPath,
	busy,
	onClose,
	onSubmit,
}: {
	open: boolean;
	title: string;
	action: string;
	initialPath: string;
	busy: boolean;
	onClose: () => void;
	onSubmit: (path: string) => void;
}) {
	const [path, setPath] = useState(initialPath);
	const trimmed = path.trim();
	return (
		<Dialog
			open={open}
			onClose={onClose}
			fullWidth
			maxWidth="sm"
			slotProps={{ transition: { onEnter: () => setPath(initialPath) } }}
		>
			<DialogTitle>{title}</DialogTitle>
			<DialogContent sx={{ pt: "8px !important" }}>
				<TextField
					autoFocus
					fullWidth
					label="Path"
					value={path}
					onChange={(event) => setPath(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && trimmed) onSubmit(trimmed);
					}}
					helperText="Relative to the Ansible directory, e.g. roles/web/tasks/main.yml"
					slotProps={{ htmlInput: { spellCheck: false } }}
				/>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2.5 }}>
				<Button color="inherit" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="contained"
					disabled={!trimmed || trimmed === initialPath}
					loading={busy}
					onClick={() => onSubmit(trimmed)}
				>
					{action}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

export function ConfirmDialog({
	open,
	title,
	children,
	action,
	destructive,
	busy,
	onClose,
	onConfirm,
}: {
	open: boolean;
	title: string;
	children: ReactNode;
	action: string;
	destructive?: boolean;
	busy: boolean;
	onClose: () => void;
	onConfirm: () => void;
}) {
	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
			<DialogTitle>{title}</DialogTitle>
			<DialogContent>
				<Typography variant="body2" sx={{ color: "text.secondary" }}>
					{children}
				</Typography>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2.5 }}>
				<Button color="inherit" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="contained"
					color={destructive ? "error" : "primary"}
					loading={busy}
					onClick={onConfirm}
				>
					{action}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

export function CommitDialog({
	open,
	branch,
	opensPullRequest,
	busy,
	onClose,
	onCommit,
}: {
	open: boolean;
	branch: string;
	opensPullRequest: boolean;
	busy: boolean;
	onClose: () => void;
	onCommit: (message: string) => void;
}) {
	const [message, setMessage] = useState("");
	return (
		<Dialog
			open={open}
			onClose={onClose}
			fullWidth
			maxWidth="sm"
			slotProps={{ transition: { onEnter: () => setMessage("") } }}
		>
			<DialogTitle>Commit & push</DialogTitle>
			<DialogContent sx={{ display: "grid", gap: 1.5, pt: "8px !important" }}>
				<Typography variant="body2" sx={{ color: "text.secondary" }}>
					Commits every saved change to {branch}
					{opensPullRequest ? " and opens its pull request." : "."} You are the commit
					author.
				</Typography>
				<TextField
					autoFocus
					multiline
					minRows={3}
					label="Commit message"
					value={message}
					onChange={(event) => setMessage(event.target.value)}
					slotProps={{ htmlInput: { maxLength: 4000 } }}
				/>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2.5 }}>
				<Button color="inherit" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="contained"
					disabled={!message.trim()}
					loading={busy}
					onClick={() => onCommit(message.trim())}
				>
					Commit & push
				</Button>
			</DialogActions>
		</Dialog>
	);
}
