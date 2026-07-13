import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/space-grotesk";
import "@/styles/index.css";
import { AuthProvider } from "@/core/auth/AuthProvider";
import { App } from "@/view/App";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: { staleTime: 5_000, refetchOnWindowFocus: false, retry: 1 },
	},
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<App />
			</AuthProvider>
		</QueryClientProvider>
	</StrictMode>,
);
