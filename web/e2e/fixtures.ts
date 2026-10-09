import { test as base, expect, type APIRequestContext } from "@playwright/test";

export const API = "http://127.0.0.1:8001";

/** Fake secrets planted in the demo data and examples. None may ever be shown on a page. */
export const PLANTED_SECRETS = [
  "sk-test-FAKE",
  "sk-test-EXAMPLE-not-a-real-key",
  "Demo-Only-123",
  "078-05-1120",
  "4242 4242",
];

type Fixtures = { live: void; api: APIRequestContext };

/**
 * Every test gets:
 * - Demo mode OFF, so pages read the real backend instead of the seeded mocks;
 * - a guard that fails the test if anything asks the paid LLM (allowLlm: true);
 * - a check that no page threw an uncaught error.
 * Tests that want Demo mode use `demoTest` below instead.
 */
export const test = base.extend<Fixtures>({
  live: [
    async ({ page }, provide) => {
      await page.addInitScript(() => localStorage.setItem("pi-demo-mode", "0"));
      await page.route("**/classify", async (route) => {
        const request = route.request();
        if (request.method() === "POST" && request.postDataJSON()?.allowLlm) {
          await route.abort();
          throw new Error("A test tried to make a paid LLM call (allowLlm: true)");
        }
        await route.continue();
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await provide();
      expect(errors, "uncaught errors in the page").toEqual([]);
    },
    { auto: true },
  ],
  api: async ({ playwright }, provide) => {
    const context = await playwright.request.newContext({ baseURL: API });
    await provide(context);
    await context.dispose();
  },
});

export const demoTest = base;

export { expect };
