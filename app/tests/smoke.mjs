import { launch, BASE, watch } from "./harness.mjs";

const errors = [];
const DIR = process.env.SHOT_DIR || new URL("../.shots", import.meta.url).pathname;

const browser = await launch();
const page = watch(await browser.newPage({ viewport: { width: 1440, height: 940 } }), errors);

const step = async (name, fn) => {
  const before = errors.length;
  try { await fn(); } catch (e) { errors.push(`step "${name}" threw: ${e.message}`); }
  const fresh = errors.slice(before);
  console.log(`${fresh.length ? "FAIL" : "ok  "}  ${name}${fresh.length ? "\n      " + fresh.join("\n      ") : ""}`);
};

await step("load", async () => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".rail", { timeout: 5000 });
});

const routes = ["#/today", "#/tasks", "#/upcoming", "#/inbox", "#/projects", "#/calendar", "#/pages", "#/habits", "#/notes", "#/review", "#/settings"];
for (const route of routes) {
  await step(`route ${route}`, async () => {
    await page.goto(BASE + "/" + route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(220);
    const count = await page.locator(".view").count();
    if (!count) throw new Error("no .view rendered");
  });
}

await step("open first project board", async () => {
  await page.goto(BASE + "/#/projects", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  await page.locator(".gcard").first().click();
  await page.waitForSelector(".board .column", { timeout: 3000 });
  const cards = await page.locator(".tcard").count();
  if (!cards) throw new Error("board has no cards");
});

await step("open task card -> drawer", async () => {
  await page.locator(".tcard").first().click();
  await page.waitForSelector(".drawer", { timeout: 3000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
});

await step("quick add via keyboard", async () => {
  await page.keyboard.press("n");
  await page.waitForSelector(".modal .quickadd__input", { timeout: 3000 });
  await page.fill(".modal .quickadd__input", "Test the smoke task tomorrow !high +smoke");
  await page.waitForTimeout(120);
  const chips = await page.locator(".modal .quickadd__hint .chip").count();
  if (chips < 3) throw new Error(`parse preview showed ${chips} chips`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
});

await step("added task appears in tasks list", async () => {
  await page.goto(BASE + "/#/tasks", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  const found = await page.getByText("Test the smoke task").count();
  if (!found) throw new Error("new task not listed");
});

await step("complete a task", async () => {
  const row = page.locator(".task-row").first();
  await row.locator(".check").first().click();
  await page.waitForTimeout(250);
});

await step("command palette", async () => {
  await page.keyboard.press("Control+k");
  await page.waitForSelector(".palette", { timeout: 3000 });
  await page.fill(".palette__input", "read");
  await page.waitForTimeout(200);
  const items = await page.locator(".palette__item").count();
  if (!items) throw new Error("palette returned nothing for 'read'");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
});

await step("page: reading list board + entry drawer", async () => {
  await page.goto(BASE + "/#/pages", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  await page.getByText("Reading list").first().click();
  await page.waitForTimeout(300);
  await page.locator(".gcard").first().click();
  await page.waitForSelector(".drawer", { timeout: 3000 });
  await page.keyboard.press("Escape");
});

await step("new page dialog with templates", async () => {
  await page.goto(BASE + "/#/pages", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "New page" }).first().click();
  await page.waitForSelector(".modal", { timeout: 3000 });
  const templates = await page.locator(".modal .gcard").count();
  if (templates < 5) throw new Error(`only ${templates} templates shown`);
  await page.fill(".modal input.input", "Trip planning");
  await page.getByText("Goals", { exact: true }).click();
  await page.getByRole("button", { name: "Create page" }).click();
  await page.waitForTimeout(400);
  const title = await page.locator(".topbar__title").innerText();
  if (!title.includes("Trip planning")) throw new Error(`landed on "${title}"`);
});

await step("habits toggle", async () => {
  await page.goto(BASE + "/#/habits", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  await page.locator(".habit-day__box:not([disabled])").first().click();
  await page.waitForTimeout(220);
});

await step("notes editor", async () => {
  await page.goto(BASE + "/#/notes", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  await page.locator(".note-card").first().click();
  await page.waitForSelector(".editor__area", { timeout: 3000 });
  await page.fill(".editor__area", "Edited by the smoke test.");
  await page.waitForTimeout(600);
});

await step("theme toggle persists", async () => {
  await page.goto(BASE + "/#/today", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  await page.locator('.rail__btn[aria-label="Toggle theme"]').click();
  await page.waitForTimeout(250);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (theme !== "light") throw new Error(`theme is ${theme}`);
  await page.reload({ waitUntil: "networkidle" });
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  if (after !== "light") throw new Error(`theme did not persist (${after})`);
  await page.locator('.rail__btn[aria-label="Toggle theme"]').click();
  await page.waitForTimeout(200);
});

await step("drag a card between columns", async () => {
  await page.goto(BASE + "/#/projects", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  await page.locator(".gcard").first().click();
  await page.waitForSelector(".tcard", { timeout: 3000 });
  const source = page.locator(".column").nth(0).locator(".tcard").first();
  const target = page.locator(".column").nth(1).locator(".column__list");
  await source.dragTo(target);
  await page.waitForTimeout(300);
});

await step("screenshots", async () => {
  await page.goto(BASE + "/#/today", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: DIR + "/today.png" });
  await page.goto(BASE + "/#/projects", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.locator(".gcard").first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: DIR + "/board.png" });
});

await browser.close();
console.log(`\n${errors.length ? `${errors.length} PROBLEM(S)` : "all clean"}`);
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
