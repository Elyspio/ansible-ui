import { alpha, createTheme, type Theme } from "@mui/material/styles";

export type Mode = "light" | "dark";

const fontSans =
	'"Geist Variable", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const fontMono = '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace';

// Ops-terminal palette: neutral zinc base, single desaturated emerald accent.
const palette = {
	light: {
		primary: "#177a54",
		primaryDark: "#116244",
		secondary: "#b45309",
		background: "#f4f4f5",
		paper: "#ffffff",
		text: "#09090b",
		muted: "#3f3f46",
		divider: "#e4e4e7",
		success: "#16a571",
		warning: "#b45309",
		error: "#dc2626",
	},
	dark: {
		primary: "#2fbf87",
		primaryDark: "#25a171",
		secondary: "#e8944a",
		background: "#0a0a0b",
		paper: "#18181b",
		text: "#fafafa",
		muted: "#d4d4d8",
		divider: "#27272a",
		success: "#34d399",
		warning: "#fbbf24",
		error: "#f87171",
	},
} as const;

/** Terminal surface — always dark, whatever the app mode. */
export const terminal = {
	background: "#0c0e0d",
	text: "#d8dedb",
	border: "#1f2422",
	fontFamily: fontMono,
} as const;

export { fontMono, fontSans };

export function buildTheme(mode: Mode): Theme {
	const colors = palette[mode];
	const theme = createTheme({
		palette: {
			mode,
			primary: { main: colors.primary, dark: colors.primaryDark, contrastText: "#ffffff" },
			secondary: { main: colors.secondary, contrastText: "#ffffff" },
			success: { main: colors.success },
			warning: { main: colors.warning },
			error: { main: colors.error },
			background: { default: colors.background, paper: colors.paper },
			text: { primary: colors.text, secondary: colors.muted },
			divider: colors.divider,
		},
		shape: { borderRadius: 12 },
		spacing: 8,
		typography: {
			fontFamily: fontSans,
			h1: { fontSize: 26, fontWeight: 650, letterSpacing: "-0.03em", lineHeight: 1.15 },
			h2: { fontSize: 21, fontWeight: 650, letterSpacing: "-0.02em" },
			h4: { fontSize: 18, fontWeight: 650, letterSpacing: "-0.02em" },
			h5: { fontSize: 16, fontWeight: 600, letterSpacing: "-0.015em" },
			body1: { fontSize: 14.5, letterSpacing: "-0.005em" },
			body2: { fontSize: 13 },
			overline: {
				fontFamily: fontMono,
				fontSize: 11,
				fontWeight: 500,
				letterSpacing: "0.08em",
			},
			button: { textTransform: "none", fontWeight: 600 },
		},
	});

	return createTheme(theme, {
		components: {
			MuiCssBaseline: {
				styleOverrides: {
					"html, body, #root": { height: "100%" },
					body: {
						margin: 0,
						backgroundColor: colors.background,
						fontFeatureSettings: '"ss01", "cv11"',
					},
					"*": { boxSizing: "border-box" },
					"*:focus-visible": {
						outline: `3px solid ${alpha(colors.primary, 0.45)}`,
						outlineOffset: 2,
					},
				},
			},
			MuiButton: {
				defaultProps: { disableElevation: true },
				styleOverrides: {
					root: {
						minHeight: 34,
						borderRadius: 8,
						whiteSpace: "nowrap",
						"&:active": { transform: "translateY(1px)" },
					},
					sizeSmall: { minHeight: 28, fontSize: 12 },
					outlinedInherit: { borderColor: colors.divider, color: colors.text },
					textInherit: { color: colors.muted },
				},
			},
			MuiTextField: {
				defaultProps: { variant: "standard" },
				styleOverrides: {
					root: {
						"& .MuiInputLabel-root": {
							fontFamily: fontMono,
							fontSize: 11,
							letterSpacing: "0.08em",
							textTransform: "uppercase",
						},
						"& .MuiInputBase-input": { fontWeight: 500 },
					},
				},
			},
			MuiChip: {
				styleOverrides: {
					root: { fontWeight: 600 },
					labelSmall: { fontFamily: fontMono, fontSize: 11, letterSpacing: "0.02em" },
				},
			},
			MuiPaper: { styleOverrides: { rounded: { borderRadius: 12 } } },
			MuiDialog: {
				styleOverrides: {
					paper: { border: `1px solid ${colors.divider}`, boxShadow: theme.shadows[12] },
				},
			},
			MuiTooltip: {
				styleOverrides: {
					tooltip: { fontSize: 12, backgroundColor: colors.text, color: colors.paper },
				},
			},
		},
	});
}
