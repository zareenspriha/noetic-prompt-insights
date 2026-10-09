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

const getAnswer = () => screen.findByRole("button", { name: /Get answer/ });

describe("Team insights (demo mode)", () => {
  it("writes the answer with the LLM when Get answer is pressed, with a visual that fits the question", async () => {
    const user = userEvent.setup();
    renderWithQuery(<InsightsPage />);
    expect(await screen.findByText("No answer yet")).toBeInTheDocument(); // nothing runs on its own
    await screen.findByRole("radio", { name: "engineering" }); // departments loaded

    await user.click(await getAnswer());
    expect(await screen.findByRole("heading", { name: "What was this team working on?" })).toBeInTheDocument();
    expect(screen.getByText("Written by the LLM")).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Prompts by topic" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Anything sensitive or risky/ }));
    await user.click(await getAnswer());
    expect(
      await screen.findByRole("heading", { name: "Did this team put anything sensitive or risky into AI tools?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Prompts by risk severity" })).toBeInTheDocument();
  });
});

describe("Team insights (live API)", () => {
  it("sends only the preset choices, and only after Get answer is pressed", async () => {
    setLiveApi();
    const user = userEvent.setup();
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body as string | undefined });
        const json = url.endsWith("/ask")
          ? askMock.llm
          : { teams: ["engineering", "sales"], week: "2026-W41", flags: [], trend: [], heatmap: [] };
        return new Response(JSON.stringify(json), { status: 200 });
      }),
    );
    renderWithQuery(<InsightsPage />);
    await screen.findByRole("radio", { name: "engineering" });
    expect(calls.some((c) => c.url.endsWith("/ask"))).toBe(false);

    await user.click(await getAnswer());
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/ask"))).toBe(true));
    const body = JSON.parse(calls.find((c) => c.url.endsWith("/ask"))!.body!);
    expect(body).toEqual({ question: "overview", team: "engineering", days: 5, allowLlm: true });
  });
});
