import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ClassifyPage from "@/app/classify/page";
import ReviewPage from "@/app/review/page";
import ChallengePage from "@/app/challenge/page";
import classifyMock from "@/mocks/classify.json";
import reviewMock from "@/mocks/review.json";
import { renderWithQuery, setLiveApi } from "./render";

describe("Classify page (demo mode)", () => {
  it("only calls the paid LLM after the user switches it on", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ClassifyPage />);
    await user.click(screen.getByRole("button", { name: "Hidden API key" }));
    await user.click(screen.getByRole("button", { name: "Classify" }));
    expect(await screen.findByText("kNN only")).toBeInTheDocument();
    expect(screen.getByText(/not run/)).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Also ask the LLM" }));
    await user.click(screen.getByRole("button", { name: "Classify" }));
    expect(await screen.findByText("Models agree")).toBeInTheDocument();
    expect(screen.getByText(/Similarity scores, not confidence/)).toBeInTheDocument();
  });

  it("keeps Classify disabled until there is text", () => {
    renderWithQuery(<ClassifyPage />);
    expect(screen.getByRole("button", { name: "Classify" })).toBeDisabled();
  });
});

describe("Review queue (demo mode)", () => {
  it("removes a corrected item, then puts it back on undo", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ReviewPage />);
    const list = await screen.findByRole("region", { name: "Items to review" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(reviewMock.length));

    // Keyboard shortcut 2 picks Writing, then save.
    await user.keyboard("2");
    expect(screen.getByRole("button", { name: /Writing/, pressed: true })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(await screen.findByText("Model updated")).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(reviewMock.length - 1);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(reviewMock.length));
  });
});

describe("Beat the detector", () => {
  it("refuses to play against demo data, because canned answers would make the score meaningless", () => {
    renderWithQuery(<ChallengePage />);
    expect(screen.getByRole("alert")).toHaveTextContent("needs the real detector");
    expect(screen.getByRole("button", { name: "3. Try to sneak it past" })).toBeDisabled();
  });

  it("scores an escape against the live detector and offers it as a test case", async () => {
    setLiveApi();
    const slipped = { ...classifyMock, riskSpans: [], knn: { ...classifyMock.knn, severity: "low", sensitivity: "public" } };
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).endsWith("/classify") ? new Response(JSON.stringify(slipped)) : new Response("[]"),
    );
    const user = userEvent.setup();
    renderWithQuery(<ChallengePage />);

    await user.click(screen.getByRole("button", { name: "Salary" }));
    await user.type(screen.getByLabelText("2. Write a prompt that sneaks it in"), "she gets one-eighteen k");
    await user.click(screen.getByRole("button", { name: "3. Try to sneak it past" }));

    const verdict = screen.getByRole("region", { name: "Verdict" });
    expect(await within(verdict).findByText("Slipped through")).toBeInTheDocument();
    // Scoreboard: one attempt, nothing caught.
    expect(within(screen.getByRole("region", { name: "Scoreboard" })).getByText("0%")).toBeInTheDocument();
    const wall = screen.getByRole("region", { name: /Wall of escapes/ });
    expect(within(wall).getByText("she gets one-eighteen k")).toBeInTheDocument();
    expect(within(wall).getByRole("button", { name: "Save as test cases" })).toBeEnabled();

    // The game never asks for the paid LLM.
    const body = JSON.parse(String(fetch.mock.calls.find(([u]) => String(u).endsWith("/classify"))?.[1]?.body));
    expect(body).toEqual({ text: "she gets one-eighteen k", allowLlm: false });
  });
});
