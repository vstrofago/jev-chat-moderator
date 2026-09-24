import { expect, test } from "@playwright/test";
import { port, run, type Running } from "./helpers";

// The dashboard and the overlay against `pnpm showcase`: a real Vigia with a scripted chat
// and canned Jev answers, so no key or network is needed.
let vigia: Running;
let url: string;
let overlayUrl: string;

test.beforeAll(async () => {
  const p = port();
  vigia = run("apps/server/scripts/showcase.ts", ["--port", String(p)]);
  const m = await vigia.waitFor(/Showcase dashboard: (\S+)\/ {2}\(overlay: (\S+)\)/);
  url = m[1];
  overlayUrl = m[2];
});

test.afterAll(async () => {
  await vigia?.stop();
});

test("shows every decision in the live feed, with spoilers blurred", async ({ page }) => {
  await page.goto(`${url}/#live`);
  await expect(page.getByRole("heading", { name: "Live" })).toBeVisible();
  await expect(page.getByText("what controller are you using?").first()).toBeVisible();
  // Moderated messages are listed too; the spoiler text stays hidden until clicked.
  const spoiler = page.getByRole("button", { name: /Possible spoiler, click to read/ }).first();
  await expect(spoiler).toBeVisible();
  // The text sits under a blur and is hidden from screen readers until someone clicks.
  const blurred = spoiler.locator(".spoiler-blur");
  await expect(blurred).toHaveAttribute("aria-hidden", "true");
  await expect(blurred).toHaveCSS("filter", /blur/);
  await spoiler.click();
  await expect(page.locator(".msg-text", { hasText: /enjoy Malenia's brother|the next area is where/ }).first()).toBeVisible();
});

test("lists what Jev was unsure about, and a mod can act on it", async ({ page }) => {
  await page.goto(`${url}/#uncertain`);
  await expect(page.getByRole("heading", { name: "Uncertain" })).toBeVisible();
  const rows = page.locator("li, article, .row").filter({ hasText: "backseater99" });
  await expect(rows.first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Leave it" })).toHaveCount(3);
  await page.getByRole("button", { name: "Leave it" }).first().click();
  await expect(page.getByRole("button", { name: "Leave it" })).toHaveCount(2);
});

test("opens every tab", async ({ page }) => {
  await page.goto(`${url}/#live`);
  for (const tab of ["Highlights", "Rules", "Settings", "Stats", "Live"]) {
    await page.getByRole("link", { name: tab }).or(page.getByRole("button", { name: tab, exact: true })).first().click();
    await expect(page.getByRole("heading", { name: tab, exact: true })).toBeVisible();
  }
});

test("the overlay shows the current highlight, and refuses a wrong key", async ({ page, request }) => {
  await page.goto(overlayUrl);
  await expect(page.getByText("what controller are you using?")).toBeVisible();
  const wrong = await request.get(overlayUrl.replace(/key=[^&]+/, "key=wrong"));
  expect(wrong.status()).toBe(401);
});
