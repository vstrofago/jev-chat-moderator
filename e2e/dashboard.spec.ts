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

test("keeps all dashboard tabs visible on a 390px screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${url}/#settings`);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  const visibility = await page.locator(".rail button").evaluateAll((buttons) => {
    const rail = buttons[0]?.closest(".rail");
    if (!rail) return [];
    const bounds = rail.getBoundingClientRect();
    return buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left >= bounds.left && rect.right <= bounds.right;
    });
  });
  expect(visibility).toHaveLength(6);
  expect(visibility.every(Boolean)).toBe(true);
});

test("the overlay shows the current highlight in Dracula dark mode, and refuses a wrong key", async ({ page, request }) => {
  await page.goto(overlayUrl);
  await expect(page.getByText("what controller are you using?")).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".card")).toHaveCSS("background-color", "rgb(52, 55, 70)");
  await expect(page.locator(".card")).toHaveCSS("color", "rgb(248, 248, 242)");
  const wrong = await request.get(overlayUrl.replace(/key=[^&]+/, "key=wrong"));
  expect(wrong.status()).toBe(401);
});

test("renders the dashboard in Dracula Classic dark mode", async ({ page }) => {
  await page.goto(`${url}/#live`);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(40, 42, 54)");
});
