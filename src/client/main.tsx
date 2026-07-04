import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router";
import { MockAuthService } from "@client/services/MockAuthService";
import { HonoAuthService } from "@client/services/HonoAuthService";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import AuthProvider from "./contexts/AuthProvider";
import { ContentRepositoryContext, type ContentRepository } from "./contexts/ContentRepositoryContext";

const isDev = import.meta.env.DEV && import.meta.env.VITE_DEV_MODE === "true";
const authService = isDev ? new MockAuthService() : new HonoAuthService();
const queryClient = new QueryClient();
const contentRepository: ContentRepository = {};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="hono-auth-starter-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider authService={authService}>
          <ContentRepositoryContext.Provider value={contentRepository}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ContentRepositoryContext.Provider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
);
