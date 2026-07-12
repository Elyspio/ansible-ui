import { useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CssBaseline, ThemeProvider, useMediaQuery } from "@mui/material";
import { SnackbarProvider } from "notistack";
import { buildTheme, type Mode } from "@/config/theme";
import { useRunsRealtime } from "@/core/signalr/useRunsRealtime";
import { useRepositoryRealtime } from "@/core/signalr/useRepositoryRealtime";
import { Shell } from "@/view/layout/Shell";
import { PlaybooksPage } from "@/view/playbooks/PlaybooksPage";
import { HistoryPage } from "@/view/runs/HistoryPage";
import { RunPage } from "@/view/runs/RunPage";
import { InventoryPage } from "@/view/inventory/InventoryPage";

const MODE_KEY = "ansible-ui.mode";

function Realtime() {
	useRunsRealtime();
	useRepositoryRealtime();
	return null;
}

export function App() {
	const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
	const [mode, setMode] = useState<Mode>(() => {
		const stored = localStorage.getItem(MODE_KEY);
		return stored === "light" || stored === "dark" ? stored : prefersDark ? "dark" : "light";
	});
	const theme = useMemo(() => buildTheme(mode), [mode]);

	const toggleMode = () => {
		const next: Mode = mode === "dark" ? "light" : "dark";
		localStorage.setItem(MODE_KEY, next);
		setMode(next);
	};

	return (
		<ThemeProvider theme={theme}>
			<CssBaseline />
			<SnackbarProvider
				maxSnack={3}
				anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
			>
				<BrowserRouter>
					<Realtime />
					<Shell mode={mode} onToggleMode={toggleMode}>
						<Routes>
							<Route path="/" element={<PlaybooksPage />} />
							<Route path="/runs" element={<HistoryPage />} />
							<Route path="/runs/:id" element={<RunPage />} />
							<Route path="/inventory" element={<InventoryPage />} />
							<Route path="*" element={<Navigate to="/" replace />} />
						</Routes>
					</Shell>
				</BrowserRouter>
			</SnackbarProvider>
		</ThemeProvider>
	);
}
