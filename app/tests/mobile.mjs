import { launch, BASE, watch } from "./harness.mjs";
const DIR = process.env.SHOT_DIR || new URL("../.shots", import.meta.url).pathname;
const errors = [];
const browser = await launch();
const page = watch(await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }), errors);

const check = async (hash, name) => {
  await page.goto(`${BASE}/${hash}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) errors.push(`${hash}: overflows by ${over}px`);
  if (name) await page.screenshot({ path: `${DIR}/${name}.png` });
};

for (const hash of ["#/today", "#/tasks", "#/projects", "#/calendar", "#/pages", "#/habits", "#/notes", "#/review", "#/settings"]) {
  await check(hash, hash === "#/today" ? "mobile-today" : null);
}
// project board on mobile
await page.goto(`${BASE}/#/projects`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(300);
await page.locator(".gcard").first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${DIR}/mobile-board.png` });

// open nav drawer
await page.goto(`${BASE}/#/today`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(300);
await page.locator('[aria-label="Show sidebar"]').click();
await page.waitForTimeout(350);
await page.screenshot({ path: `${DIR}/mobile-nav.png` });
const sidebarVisible = await page.locator(".sidebar").isVisible();
if (!sidebarVisible) errors.push("mobile nav did not open");
await page.locator(".sidebar .nav-item", { hasText: "Habits" }).first().click();
await page.waitForTimeout(400);
const stillOpen = await page.locator(".sidebar-scrim").count();
if (stillOpen) errors.push("mobile nav stayed open after navigating");
await page.screenshot({ path: `${DIR}/mobile-after-nav.png` });

// The service worker is what makes the app usable with no signal.
await page.goto(`${BASE}/#/today`, { waitUntil: "networkidle" });
const registered = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return "unsupported";
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  return registration ? "ready" : "failed";
});
if (registered !== "ready") errors.push(`service worker: ${registered}`);

// Give the shell a moment to finish caching, then pull the plug.
await page.waitForTimeout(2500);
await page.context().setOffline(true);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
const renderedOffline = await page.locator(".rail").count();
if (!renderedOffline) errors.push("offline: the app did not render from cache");
const tasksOffline = await page.locator(".task-row, .hero").count();
if (!tasksOffline) errors.push("offline: no content rendered");
await page.screenshot({ path: `${DIR}/mobile-offline.png` });

// And it must still accept edits with no network.
await page.evaluate(async () => {
  (await import("/src/store/actions.js")).createTask({ title: "Added with no signal" });
});
await page.waitForTimeout(300);
const saved = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("dezk.state.v1")).tasks.some((t) => t.title === "Added with no signal"));
if (!saved) errors.push("offline: could not add a task");
await page.context().setOffline(false);

await browser.close();
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "mobile clean");
