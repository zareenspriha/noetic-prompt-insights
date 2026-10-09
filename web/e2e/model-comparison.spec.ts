import { test, expect } from "./fixtures";

test("keyword, kNN and LLM zero-shot are compared on the frozen benchmark", async ({ page, api }) => {
  const metrics = await (await api.get("/metrics")).json();
  expect(metrics.models.map((m: { model: string }) => m.model)).toEqual(["keyword", "knn", "llm"]);
  expect(metrics.agreement.between).toEqual(["knn", "llm"]);

  await page.goto("/models");
  const main = page.getByRole("main");
  for (const name of ["Keyword baseline", "kNN (embeddings)", "LLM zero-shot"]) {
    await expect(main.getByText(name).first()).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Agreement: kNN (embeddings) vs LLM zero-shot" })).toBeVisible();
  await expect(main).toContainText(`${metrics.agreement.pct.toFixed(1)}%`);
  await expect(main).toContainText("anthropic:claude-sonnet-5-5");
  await expect(main).not.toContainText("Not scored on the benchmark yet");
});
