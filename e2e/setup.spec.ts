import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { port, run, tempDir, type Running } from "./helpers";

// The server started with no --source and reachable from other machines, as in Docker:
// the page asks for the setup code, runs setup, then opens the dashboard on the same port.
let vigia: Running;
let url: string;
let code: string;

test.beforeAll(async () => {
  const dir = await tempDir("setup");
  const p = port();
  vigia = run("apps/server/src/cli.ts", ["--host", "0.0.0.0", "--port", String(p), "--data", join(dir, "data"), "--config", join(dir, "vigia.yaml")], {
    // Fills the Jev key step, so nothing here calls Jev.
    AI_GATEWAY_API_KEY: "vck_e2e_not_a_real_key",
  });
  code = (await vigia.waitFor(/Setup code: ([A-Z0-9]+)/))[1];
  url = `http://127.0.0.1:${p}`;
});

test.afterAll(async () => {
  await vigia?.stop();
});

test("sets Vigia up in the browser in Geist dark mode, then opens the dashboard", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Enter the setup code" })).toBeVisible();
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");

  await page.getByLabel("Setup code").fill("WRONGCODE123");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("That code is not right");

  await page.getByLabel("Setup code").fill(code.toLowerCase());
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Where should Vigia watch?" })).toBeVisible();

  await page.getByPlaceholder("Channel name").fill("twitchdev");
  await page.getByRole("button", { name: "Watch" }).click();
  // The key came from the environment, so setup is already complete.
  await expect(page.getByRole("heading", { name: "Vigia is ready" })).toBeVisible();

  await page.getByRole("button", { name: "Open the dashboard" }).click();
  await vigia.waitFor(/Vigia is running/);
  // Logged in with the same code, straight into the dashboard's first-run wizard.
  await expect(page.getByRole("heading", { name: "Welcome to Vigia" })).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).pathname).toBe("/");
});

test("keeps the settings: the dashboard needs no setup after that", async ({ request }) => {
  const health = await request.get(`${url}/health`);
  expect(await health.json()).toEqual({ ok: true });
  // The setup API is gone once Vigia runs.
  expect((await request.post(`${url}/api/setup/state`, { headers: { "X-Vigia": "1" } })).status()).not.toBe(200);
});
