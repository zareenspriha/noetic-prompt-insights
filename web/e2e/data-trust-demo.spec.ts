import { test, demoTest, expect } from "./fixtures";

test("Data & Trust shows the backend's real import counts and privacy rules", async ({ page, api }) => {
  const sources = await (await api.get("/sources")).json();
  await page.goto("/about");
  const main = page.getByRole("main");
  await expect(main).toContainText(String(sources.received));
  await expect(main).toContainText(String(sources.classified));
  await expect(main).toContainText("at least 10 events and 3 different people");
});

demoTest("Demo mode is on by default and says its numbers are placeholders", async ({ page }) => {
  await page.goto("/models");
  await expect(page.getByRole("switch", { name: "Demo mode" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Demo mode: these are placeholder numbers")).toBeVisible();
});
