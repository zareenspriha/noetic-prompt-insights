import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ClassifyPage from "@/app/classify/page";
import { reviewQueueKey, useClassify } from "@/lib/api";
import classifyMock from "@/mocks/classify.json";
import { renderWithQuery, setLiveApi } from "./render";

const live = (body: object) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body)));

function classifyHook() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const { result } = renderHook(() => useClassify(), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  return { result, invalidate };
}

describe("Classify → Review Queue", () => {
  it("refreshes the review list when the backend queued the prompt for review", async () => {
    setLiveApi();
    live({ ...classifyMock, needsReview: true });
    const { result, invalidate } = classifyHook();
    await act(() => result.current.mutateAsync({ text: "anything", allowLlm: false }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: reviewQueueKey(false) });
  });

  it("leaves the review list alone when nothing was queued", async () => {
    setLiveApi();
    live({ ...classifyMock, needsReview: false });
    const { result, invalidate } = classifyHook();
    await act(() => result.current.mutateAsync({ text: "anything", allowLlm: false }));
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("LLM cost estimate on the Classify page", () => {
  async function classifyWith(estimate: number | null) {
    setLiveApi();
    live({ ...classifyMock, llm: null, agree: null, llmCostEstimateUsd: estimate });
    renderWithQuery(<ClassifyPage />);
    fireEvent.click(screen.getByRole("button", { name: "Hidden API key" }));
    fireEvent.click(screen.getByRole("button", { name: "Classify" }));
    expect(await screen.findByText("kNN only")).toBeInTheDocument();
  }

  it("says the cost is unknown when no price is configured, never $0", async () => {
    await classifyWith(null);
    expect(screen.getByText(/Cost unknown: no price is configured on the server/)).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.0000/)).not.toBeInTheDocument();
  });

  it("shows the estimate when the server knows the price", async () => {
    await classifyWith(0.0007);
    expect(screen.getByText(/Estimated cost ≈ \$0\.0007 per prompt/)).toBeInTheDocument();
  });
});
