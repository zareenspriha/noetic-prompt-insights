import { test, expect } from "./fixtures";

const PAGES = [
  { link: "Weekly report", path: "/", heading: "What people used AI for this week" },
  { link: "Classify a prompt", path: "/classify", heading: "Classify Playground" },
  { link: "Review queue", path: "/review", heading: "Review Queue" },
  { link: "Model comparison", path: "/models", heading: "Model Comparison" },
  { link: "Beat the detector", path: "/challenge", heading: "Beat the detector" },
  { link: "Data and trust", path: "/about", heading: "Data & Trust" },
];

test("the backend is up and serving the real models", async ({ api }) => {
  const health = await (await api.get("/health")).json();
  expect(health.ok).toBe(true);
  expect(health.modelVersion).toContain("MiniLM");
});

test("every page in the sidebar opens with Demo mode off", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("switch", { name: "Demo mode" })).toHaveAttribute("aria-checked", "false");
  for (const { link, path, heading } of PAGES) {
    await page.getByRole("link", { name: link }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("pages open directly by URL", async ({ page }) => {
  for (const { path, heading } of PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});
