import { launch, BASE, watch } from "./harness.mjs";
const errors = [];
const browser = await launch();
const page = watch(await browser.newPage({ viewport: { width: 1440, height: 940 } }), errors);
page.on("dialog", (d) => d.dismiss().catch(() => {}));

const step = async (name, fn) => {
  const before = errors.length;
  try { await fn(); } catch (e) { errors.push(`step "${name}": ${e.message.split("\n")[0]}`); }
  console.log(`${errors.length > before ? "FAIL" : "ok  "}  ${name}`);
};
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("dezk.state.v1")));

await page.goto(BASE, { waitUntil: "networkidle" });

await step("inline add on a list", async () => {
  await page.goto(`${BASE}/#/inbox`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const input = page.locator('[data-role="quick-add"]').first();
  await input.fill("Inline added task friday !low +deep");
  await input.press("Enter");
  await page.waitForTimeout(350);
  const s = await state();
  const t = s.tasks.find((x) => x.title === "Inline added task");
  if (!t) throw new Error("task not created");
  if (t.priority !== "low" || !t.tags.includes("deep") || !t.due) throw new Error(`parsed wrong: ${JSON.stringify(t)}`);
  const focused = await page.evaluate(() => document.activeElement?.className || "");
  if (!focused.includes("quickadd__input")) throw new Error(`focus lost after add (on ${focused})`);
});

await step("undo with ctrl+z", async () => {
  await page.locator('[data-role="quick-add"]').first().press("Escape"); // leave the text field
  await page.waitForTimeout(150);
  const before = (await state()).tasks.length;
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(350);
  const after = (await state()).tasks.length;
  if (after !== before - 1) throw new Error(`undo did not remove the task (${before} -> ${after})`);
});

await step("g-then-key navigation", async () => {
  await page.keyboard.press("g");
  await page.keyboard.press("h");
  await page.waitForTimeout(300);
  if (!page.url().includes("#/habits")) throw new Error(`landed on ${page.url()}`);
});

await step("task filters and grouping", async () => {
  await page.goto(`${BASE}/#/tasks`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^Date$/ }).click();
  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.waitForTimeout(300);
  if (!page.url().includes("group=project")) throw new Error("grouping not applied");
  await page.getByRole("button", { name: /Priority/ }).first().click();
  await page.getByRole("menuitem", { name: "High" }).click();
  await page.waitForTimeout(300);
  const rows = await page.locator(".task-row").count();
  if (!rows) throw new Error("no high priority tasks shown");
});

await step("edit fields on a page", async () => {
  const s = await state();
  const journal = s.pages.find((p) => p.name === "Journal");
  await page.goto(`${BASE}/#/pages/${journal.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Fields" }).click();
  await page.waitForSelector(".modal", { timeout: 3000 });
  await page.getByRole("button", { name: "Add field" }).click();
  await page.waitForTimeout(300);
  const after = await state();
  const fields = after.pages.find((p) => p.id === journal.id).fields.length;
  if (fields !== journal.fields.length + 1) throw new Error("field not added");
  await page.locator(".modal .field-row").last().locator(".btn--danger").click();
  await page.waitForTimeout(300);
  const final = await state();
  if (final.pages.find((p) => p.id === journal.id).fields.length !== journal.fields.length) throw new Error("field not removed");
  await page.getByRole("button", { name: "Done" }).click();
});

await step("add a view to a page", async () => {
  const s = await state();
  const journal = s.pages.find((p) => p.name === "Journal");
  await page.locator('[aria-label="New view"]').click();
  await page.waitForSelector(".modal", { timeout: 3000 });
  await page.fill(".modal input.input", "Gallery view");
  await page.locator(".modal").getByRole("button", { name: "Gallery" }).click();
  await page.getByRole("button", { name: "Add view" }).click();
  await page.waitForTimeout(400);
  const after = await state();
  if (after.pages.find((p) => p.id === journal.id).views.length !== journal.views.length + 1) throw new Error("view not added");
  const active = await page.locator(".filterbar .btn--primary").first().innerText();
  if (!active.includes("Gallery view")) throw new Error(`active view is "${active}"`);
});

await step("edit an entry through the drawer", async () => {
  await page.locator(".gcard").first().click();
  await page.waitForSelector(".drawer", { timeout: 3000 });
  const area = page.locator(".drawer textarea").first();
  await area.fill("Rewritten by the deep test.");
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const s = await state();
  const hit = s.pages.flatMap((p) => p.records).some((r) => Object.values(r.values).includes("Rewritten by the deep test."));
  if (!hit) throw new Error("edit not saved");
});

await step("category manager", async () => {
  await page.goto(`${BASE}/#/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Manage" }).click();
  await page.waitForSelector(".modal", { timeout: 3000 });
  const before = (await state()).categories.length;
  await page.getByRole("button", { name: "Add category" }).click();
  await page.waitForTimeout(400);
  if ((await state()).categories.length !== before + 1) throw new Error("category not added");
  await page.locator(".modal .field-row").last().locator(".btn--danger").click();
  await page.waitForTimeout(400);
  if ((await state()).categories.length !== before) throw new Error("category not removed");
  await page.getByRole("button", { name: "Done" }).click();
});

await step("settings toggles persist", async () => {
  await page.goto(`${BASE}/#/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.locator('.settings-row', { hasText: "Show completed tasks" }).locator(".switch").click();
  await page.fill('.settings-row:has-text("Your name") input', "Sam");
  await page.locator('.settings-row:has-text("Focus block") input').fill("45");
  await page.locator('.settings-row:has-text("Focus block") input').press("Tab");
  await page.waitForTimeout(400);
  const s = await state();
  if (!s.settings.showCompleted || s.settings.displayName !== "Sam" || s.settings.focusMinutes !== 45) {
    throw new Error(`settings not saved: ${JSON.stringify(s.settings)}`);
  }
  await page.goto(`${BASE}/#/today`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  const greet = await page.locator(".hero__greet").innerText();
  if (!greet.includes("Sam")) throw new Error(`greeting is "${greet}"`);
  const clock = await page.locator(".timer__clock").innerText();
  if (clock !== "45:00") throw new Error(`timer shows ${clock}`);
});

await step("focus timer runs", async () => {
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(2300);
  const clock = await page.locator(".timer__clock").innerText();
  if (clock === "45:00") throw new Error("timer did not tick");
  await page.getByRole("button", { name: "Pause" }).click();
});

await step("calendar drag reschedules", async () => {
  await page.goto(`${BASE}/#/calendar`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  const pill = page.locator(".cal__pill").first();
  const title = (await pill.innerText()).trim();
  const target = page.locator('.cal__cell:not([data-muted="true"])').last();
  await pill.dragTo(target);
  await page.waitForTimeout(400);
  const moved = await target.locator(".cal__pill").count();
  if (!moved) throw new Error(`"${title}" did not land on the target day`);
});

await step("export produces a file", async () => {
  await page.goto(`${BASE}/#/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 5000 }),
    page.getByRole("button", { name: "Export" }).click(),
  ]);
  const name = download.suggestedFilename();
  if (!name.startsWith("dezk-backup-")) throw new Error(`filename was ${name}`);
});

await step("reload keeps everything", async () => {
  const before = await state();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const after = await state();
  if (after.tasks.length !== before.tasks.length || after.pages.length !== before.pages.length) {
    throw new Error("state changed across reload");
  }
});

await browser.close();
console.log(errors.length ? `\n${errors.length} problem(s):\n` + errors.join("\n") : "\nall clean");
if (errors.length) process.exit(1);
