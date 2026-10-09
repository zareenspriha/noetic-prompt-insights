import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import InsightsPage from "@/app/insights/page";
import askMock from "@/mocks/ask.json";
import { renderWithQuery, setLiveApi } from "./render";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Team insights (demo mode)", () => {
  it("answers as soon as a department is picked, with a visual that fits the question", async () => {
    const user = userEvent.setup();
    renderWithQuery(<InsightsPage />);
    expect(await screen.findByRole("heading", { name: "What was this team working on?" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Prompts by topic" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Anything sensitive or risky/ }));
    expect(
      await screen.findByRole("heading", { name: "Did this team put anything sensitive or risky into AI tools?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Prompts by risk severity" })).toBeInTheDocument();
    expect(screen.getByText("Rule-based summary")).toBeInTheDocument();
  });

  it("only writes with the LLM after the switch is on and the button is pressed", async () => {
    const user = userEvent.setup();
    renderWithQuery(<InsightsPage />);
    await screen.findByText("Rule-based summary");
    await user.click(screen.getByRole("switch", { name: "Write the answer with the LLM" }));
    expect(screen.getByText("Rule-based summary")).toBeInTheDocument(); // nothing ran yet
    await user.click(screen.getByRole("button", { name: /Get answer/ }));
    expect(await screen.findByText("Written by the LLM")).toBeInTheDocument();
  });
});

describe("Team insights (live API)", () => {
  it("sends only the preset choices, never free text", async () => {
    setLiveApi();
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body as string | undefined });
        const json = url.endsWith("/ask")
          ? askMock.rules
          : { teams: ["engineering", "sales"], week: "2026-W41", flags: [], trend: [], heatmap: [] };
        return new Response(JSON.stringify(json), { status: 200 });
      }),
    );
    renderWithQuery(<InsightsPage />);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/ask"))).toBe(true));
    const body = JSON.parse(calls.find((c) => c.url.endsWith("/ask"))!.body!);
    expect(body).toEqual({ question: "overview", team: "engineering", days: 5, allowLlm: false });
  });
});
