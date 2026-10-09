import { test, expect } from "./fixtures";

const KEY = "sk-test-EXAMPLE-not-a-real-key";

/**
 * A prompt kNN has never seen (made-up words keep its similarity low), unique per run so a
 * correction learned in an earlier run cannot make it familiar. Contains a fake key to mask.
 */
function unfamiliarPrompt() {
  const run = Math.random().toString(36).slice(2, 8);
  return { text: `Flombix grue tarnwhistle oplex ${KEY} zyx${run}`, marker: `zyx${run}` };
}

async function classify(page: import("@playwright/test").Page, text: string) {
  await page.goto("/classify");
  await page.getByPlaceholder("Paste a prompt someone might send to an AI tool").fill(text);
  await expect(page.getByRole("switch", { name: "Also ask the LLM" })).toHaveAttribute("aria-checked", "false");
  const response = page.waitForResponse((r) => r.url().endsWith("/classify") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Classify", exact: true }).click();
  return (await response).json();
}

test("kNN-only classify masks the key and explains its answer", async ({ page }) => {
  await page.goto("/classify");
  await page.getByRole("button", { name: "Hidden API key" }).click();
  await expect(page.getByRole("switch", { name: "Also ask the LLM" })).toHaveAttribute("aria-checked", "false");
  const response = page.waitForResponse((r) => r.url().endsWith("/classify") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Classify", exact: true }).click();
  const body = await (await response).json();

  expect(body.textRedacted).not.toContain(KEY);
  expect(body.llm).toBeNull(); // no paid call
  await expect(page.getByText("kNN · local")).toBeVisible();
  await expect(page.getByText("LLM · not run")).toBeVisible();
  await expect(page.getByText("5 nearest labelled examples")).toBeVisible();
  await expect(page.getByText("Free (local)")).toBeVisible();
});

test("a prompt that needs review really appears at the top of the Review Queue", async ({ page }) => {
  const { text, marker } = unfamiliarPrompt();
  const body = await classify(page, text);
  expect(body.needsReview, "made-up words are unfamiliar to kNN, so it should need review").toBe(true);
  await expect(page.getByText("Sent to the Review Queue")).toBeVisible();

  await page.getByRole("link", { name: "Review queue" }).click();
  const first = page.getByRole("region", { name: "Items to review" }).getByRole("button").first();
  await expect(first).toContainText("Unfamiliar");
  await expect(first).toContainText(marker);
  // The queue shows the stored, redacted text; the key never reaches it.
  await expect(page.getByRole("region", { name: "Items to review" })).not.toContainText(KEY);
  await expect(page.getByRole("region", { name: "Selected item" })).not.toContainText(KEY);
});

test("correcting a classified prompt removes it from the queue, and Undo brings it back", async ({ page }) => {
  const { text, marker } = unfamiliarPrompt();
  await classify(page, text);
  await expect(page.getByText("Sent to the Review Queue")).toBeVisible();

  await page.getByRole("link", { name: "Review queue" }).click();
  const list = page.getByRole("region", { name: "Items to review" });
  const ours = list.getByRole("button").filter({ hasText: marker });
  await expect(ours).toHaveCount(1);
  await ours.click();

  const panel = page.getByRole("region", { name: "Selected item" });
  await panel.getByRole("button", { name: /Coding/ }).click();
  await panel.getByRole("button", { name: "Confidential", exact: true }).click();
  await panel.getByRole("button", { name: "Save correction" }).click();

  await expect(page.getByText("Saved as Coding · Confidential")).toBeVisible();
  await expect(ours).toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(ours).toHaveCount(1);
});
