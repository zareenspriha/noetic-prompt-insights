import { describe, expect, it } from "vitest";
import { judge, score, toTestCases, type Attempt } from "@/lib/challenge";
import classifyMock from "@/mocks/classify.json";
import type { ClassifyResponse, RiskSpan, Severity } from "@/types/api";

const base = classifyMock as ClassifyResponse;
function result(kinds: RiskSpan["kind"][], severity: Severity = "low"): ClassifyResponse {
  return {
    ...base,
    riskSpans: kinds.map((kind, i) => ({ start: i, end: i + 1, kind })),
    knn: { ...base.knn, severity, sensitivity: "public", topic: "coding" },
  };
}
const attempt = (caught: boolean, text: string): Attempt => ({
  id: text.length,
  secret: "salary",
  text,
  caught,
  reason: caught ? "x" : "",
  result: result([]),
});

describe("judge", () => {
  it("counts a hidden secret as caught when the rules find that kind of secret", () => {
    expect(judge("salary", result(["salary"]))).toEqual({ caught: true, reason: "The rules flagged it: Salary figure" });
    expect(judge("personal", result(["email"])).caught).toBe(true);
  });

  it("counts it as caught when the prompt is rated high or critical for another reason", () => {
    expect(judge("injection", result([], "critical"))).toEqual({ caught: true, reason: "Rated critical risk overall" });
  });

  it("counts it as slipped through when nothing relevant fired", () => {
    // An email span doesn't catch a hidden salary, and medium risk isn't enough.
    expect(judge("salary", result(["email"], "medium"))).toEqual({ caught: false, reason: "" });
  });
});

describe("score", () => {
  it("has no catch rate before the first attempt, so the UI never shows 0% for nothing", () => {
    expect(score([])).toEqual({ total: 0, caught: 0, slipped: 0, catchRate: null });
  });

  it("tallies caught and slipped attempts", () => {
    expect(score([attempt(true, "a"), attempt(false, "bb"), attempt(false, "ccc")])).toMatchObject({
      total: 3,
      caught: 1,
      slipped: 2,
    });
  });
});

describe("toTestCases", () => {
  it("exports only escapes, as benchmark-shaped rows marked for human review", () => {
    const rows = toTestCases([attempt(true, "caught one"), attempt(false, "pay her one-eighteen k")])
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["id", "kind", "sensitivity", "text", "topic", "why"]);
    expect(rows[0]).toMatchObject({ id: "escape-01", kind: "implicit_sensitive", sensitivity: "confidential" });
    expect(rows[0].why).toMatch(/check it before use/);
  });
});
