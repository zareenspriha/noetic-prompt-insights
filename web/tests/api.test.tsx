import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError, errorMessage } from "@/lib/api";
import DataTrustPage from "@/app/about/page";
import { renderWithQuery, setLiveApi } from "./render";

describe("errors shown to users", () => {
  it("passes the backend's own explanation through", async () => {
    setLiveApi();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "No LLM is configured on the server" }), { status: 503 }),
    );
    renderWithQuery(<DataTrustPage />);
    expect(await screen.findByText("No LLM is configured on the server")).toBeInTheDocument();
  });

  it("tells you how to start the backend when it can't be reached", async () => {
    setLiveApi();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithQuery(<DataTrustPage />);
    expect(await screen.findByText(/python -m prompt_insights serve/)).toBeInTheDocument();
  });

  it("keeps the status code on ApiError for callers that need it", () => {
    const error = new ApiError(409, "Run label-events first");
    expect(error.status).toBe(409);
    expect(errorMessage(error)).toBe("Run label-events first");
    expect(errorMessage("plain")).toBe("plain");
  });
});

describe("Data and trust page", () => {
  it("shows the import counts from /sources in live mode", async () => {
    setLiveApi();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          received: 994,
          deduped: 0,
          failed: 26,
          blocked: 8,
          classified: 960,
          gateway: { connected: false, url: null, lastImportAt: null },
          project1DashboardUrl: null,
        }),
      ),
    );
    renderWithQuery(<DataTrustPage />);
    expect(await screen.findByText("960")).toBeInTheDocument();
    expect(screen.getByText("26")).toBeInTheDocument();
    expect(screen.getByText(/not a live gateway connection/)).toBeInTheDocument();
    expect(screen.getByText(/Last loaded: never/)).toBeInTheDocument();
  });
});
