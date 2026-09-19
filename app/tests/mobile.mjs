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

await browser.close();
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "mobile clean");
