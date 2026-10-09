import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { headline } from "@/components/models/labels";
import { KpiTile } from "@/components/shared/kpi-tile";
import metricsMock from "@/mocks/metrics.json";
import type { Metrics } from "@/types/api";

const models = (metricsMock as Metrics).models;
const only = (...ids: string[]) => models.filter((m) => ids.includes(m.model));

describe("Model comparison headline", () => {
  it("is built only from the numbers it is given", () => {
    const [knn] = only("knn");
    const text = headline(only("keyword", "knn"));
    expect(text).toContain(knn.topicMacroF1.toFixed(2));
    expect(text).not.toContain("LLM");
  });

  it("compares against the LLM once it has been scored", () => {
    expect(headline(only("keyword", "knn", "llm"))).toMatch(/of the LLM's topic macro-F1/);
  });
});

describe("KPI tile", () => {
  it("shows an absolute change instead of a meaningless percentage when last week was zero", () => {
    render(<KpiTile label="Critical flags" value={2} prev={0} />);
    expect(screen.getByText("+2 vs 0 last week")).toBeInTheDocument();
  });

  it("says when there is no previous week to compare with", () => {
    render(<KpiTile label="Total prompts" value={290} prev={null} />);
    expect(screen.getByText("No previous week")).toBeInTheDocument();
  });
});
