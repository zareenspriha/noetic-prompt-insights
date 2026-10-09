import { test, expect, PLANTED_SECRETS } from "./fixtures";

test("KPIs match the backend's weekly report", async ({ page, api }) => {
  const report = await (await api.get("/report/weekly")).json();
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main).toContainText(`Week ${Number(report.week.slice(-2))} of ${report.week.slice(0, 4)}`);
  await expect(main).toContainText(String(report.kpis.totalPrompts.value));
  await expect(main).toContainText(`${report.kpis.pctConfidential.value}%`);
});

test("the team x topic heatmap hides small groups", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /: \d+ prompts$/ }).first()).toBeVisible();
  const hidden = page.getByRole("button", { name: /fewer than 10 prompts, suppressed/ });
  expect(await hidden.count()).toBeGreaterThan(0);
  await expect(page.getByText("Gaps are weeks hidden for privacy")).toBeVisible();
});

test("switching labels to LLM zero-shot uses the saved LLM results", async ({ page, api }) => {
  const llm = await (await api.get("/report/weekly?model=llm")).json();
  await page.goto("/");
  await page.getByLabel("Labels from").selectOption("llm");
  await expect(page.getByRole("main")).toContainText(`${llm.kpis.pctConfidential.value}%`);
  await expect(page.getByText(`${llm.flags.length} of ${llm.flags.length} flags`)).toBeVisible();
});

test("no planted secret is ever shown in the report", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Flagged prompts")).toBeVisible();
  for (const model of ["knn", "keyword", "llm"]) {
    await page.getByLabel("Labels from").selectOption(model);
    await expect(page.getByText(/of \d+ flags/)).toBeVisible();
    const text = await page.getByRole("main").innerText();
    for (const secret of PLANTED_SECRETS) expect(text, `${secret} on ${model} view`).not.toContain(secret);
  }
});
