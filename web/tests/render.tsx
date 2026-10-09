import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { Toaster } from "sonner";

/** Render with the same query settings as the app (no retries, so errors show at once). */
export function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      {ui}
      <Toaster />
    </QueryClientProvider>,
  );
}

/** Demo mode is stored in localStorage; "0" means call the live API. */
export const setLiveApi = () => localStorage.setItem("pi-demo-mode", "0");
