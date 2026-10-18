import { alpha, createTheme, type Theme } from "@mui/material/styles";

export type Mode = "light" | "dark";

declare module "@mui/material/styles" {
	interface TypeBackground {
		/** Surface one step above paper: active rows, tabs, status bar. */
		raised: string;
	}
}

// One variable family: Recursive's MONO axis turns the UI face into the code face, so code and
// interface share proportions instead of pairing two unrelated typefaces.
const fontSans = '"Recursive Variable", system-ui, sans-serif';
const fontMono = '"Recursive Variable", ui-monospace, monospace';
const sansVariation = '"MONO" 0, "CASL" 0.2';
const monoVariation = '"MONO" 1, "CASL" 0';

/** Spread into `sx` for code-like text: same family as the UI, monospaced axis. */
export const mono = { fontFamily: fontMono, fontVariationSettings: monoVariation } as const;

// Workbench palette: warm dark like a rack under sodium light; amber marks what you act on and
// what changed, green is kept for success only.
const palette = {
	light: {
		primary: "#a35f07",
		primaryDark: "#844c04",
		primaryText: "#ffffff",
		secondary: "#3d6f8c",
		background: "#f3f0eb",
		paper: "#fbf9f6",
		raised: "#ebe5dc",
		text: "#1f1a14",
		muted: "#6a5d4e",
		divider: "#ddd4c7",
		success: "#2f7d45",
		warning: "#9a6a00",
		error: "#b8402f",
		info: "#3d6f8c",
	},
	dark: {
		primary: "#f0a43c",
		primaryDark: "#d68b25",
		primaryText: "#2a1a05",
		secondary: "#8fb8d8",
		background: "#16130f",
		paper: "#1d1915",
		raised: "#26211b",
		text: "#efe7dc",
		muted: "#a89a88",
		divider: "#332c24",
		success: "#7fc58f",
		warning: "#e6c26b",
		error: "#e58a7a",
		info: "#8fb8d8",
	},
} as const;

/** Code and terminal surface: always dark, whatever the app mode. */
export const terminal = {
	background: "#120f0c",
	text: "#e2d8ca",
	muted: "#786b5b",
	border: "#2a241d",
	fontFamily: fontMono,
	fontVariationSettings: monoVariation,
} as const;

export { fontMono, fontSans, monoVariation };

export function buildTheme(mode: Mode): Theme {
	const colors = palette[mode];
	const theme = createTheme({
		palette: {
			mode,
			primary: {
				main: colors.primary,
				dark: colors.primaryDark,
				contrastText: colors.primaryText,
			},
			secondary: { main: colors.secondary },
			success: { main: colors.success },
			warning: { main: colors.warning },
			error: { main: colors.error },
			info: { main: colors.info },
			background: { default: colors.background, paper: colors.paper, raised: colors.raised },
			text: { primary: colors.text, secondary: colors.muted },
			divider: colors.divider,
		},
		shape: { borderRadius: 8 },
		spacing: 8,
		typography: {
			fontFamily: fontSans,
			h1: { fontSize: 24, fontWeight: 680, letterSpacing: "-0.02em", lineHeight: 1.2 },
			h2: { fontSize: 19, fontWeight: 650, letterSpacing: "-0.015em" },
			h4: { fontSize: 17, fontWeight: 650, letterSpacing: "-0.01em" },
			h5: { fontSize: 15, fontWeight: 620 },
			body1: { fontSize: 14 },
			body2: { fontSize: 13 },
			overline: {
				...mono,
				fontSize: 11,
				fontWeight: 500,
				letterSpacing: "0.02em",
				textTransform: "none",
			},
			button: { textTransform: "none", fontWeight: 620 },
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
						fontVariationSettings: sansVariation,
					},
					"*": { boxSizing: "border-box" },
					"*:focus-visible": {
						outline: `2px solid ${alpha(colors.primary, 0.6)}`,
						outlineOffset: 2,
					},
					"code, kbd, pre, samp": { ...mono },
				},
			},
			MuiButton: {
				defaultProps: { disableElevation: true },
				styleOverrides: {
					root: {
						minHeight: 32,
						borderRadius: 6,
						whiteSpace: "nowrap",
						"&:active": { transform: "translateY(1px)" },
					},
					sizeSmall: { minHeight: 28, fontSize: 12.5 },
					outlinedInherit: { borderColor: colors.divider, color: colors.text },
					textInherit: { color: colors.muted },
				},
			},
			MuiIconButton: { styleOverrides: { root: { borderRadius: 6 } } },
			MuiTextField: { defaultProps: { variant: "outlined", size: "small" } },
			MuiOutlinedInput: {
				styleOverrides: {
					root: {
						backgroundColor: colors.background,
						"& .MuiOutlinedInput-notchedOutline": { borderColor: colors.divider },
						"&.Mui-focused .MuiOutlinedInput-notchedOutline": {
							boxShadow: `0 0 0 3px ${alpha(colors.primary, 0.18)}`,
						},
					},
				},
			},
			MuiChip: {
				styleOverrides: {
					root: { fontWeight: 600, borderRadius: 6 },
					labelSmall: { ...mono, fontSize: 11.5 },
				},
			},
			// Elevation tints turn dark papers grey; surfaces carry their own colour instead.
			MuiPaper: {
				styleOverrides: {
					root: { backgroundImage: "none" },
					rounded: { borderRadius: 10 },
				},
			},
			MuiDialog: {
				styleOverrides: {
					paper: {
						backgroundColor: colors.paper,
						border: `1px solid ${colors.divider}`,
						boxShadow: `0 24px 60px ${alpha("#000", mode === "dark" ? 0.55 : 0.18)}`,
					},
				},
			},
			MuiDialogTitle: { styleOverrides: { root: { fontSize: 17, fontWeight: 650 } } },
			MuiMenu: {
				styleOverrides: {
					paper: { border: `1px solid ${colors.divider}`, backgroundColor: colors.paper },
				},
			},
			MuiTooltip: {
				styleOverrides: {
					tooltip: { fontSize: 12, backgroundColor: colors.text, color: colors.paper },
				},
			},
			MuiTab: { styleOverrides: { root: { textTransform: "none", minHeight: 36 } } },
		},
	});
}
