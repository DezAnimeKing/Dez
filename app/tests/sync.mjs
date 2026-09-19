import { launch, watch } from "./harness.mjs";

// Two independent browser profiles talking to one Worker, the way a laptop and
// a phone would. BASE must point at `wrangler dev`, not the static server.
const BASE = process.env.SYNC_BASE || "http://127.0.0.1:8790";
const PASSPHRASE = process.env.SYNC_PASSPHRASE || "open-sesame-test";

const errors = [];
const browser = await launch();

const step = async (name, fn) => {
  const before = errors.length;
  try { await fn(); } catch (error) { errors.push(`step "${name}": ${error.message.split("\n")[0]}`); }
  console.log(`${errors.length > before ? "FAIL" : "ok  "}  ${name}`);
};

async function device(label, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = watch(await context.newPage(), errors, `${label}: `);
  await page.goto(BASE, { waitUntil: "networkidle" });
  return {
    label,
    page,
    state: () => page.evaluate(() => JSON.parse(localStorage.getItem("dezk.state.v1"))),
    async syncNow() {
      await page.evaluate(async () => {
        const module = await import("/src/store/sync.js");
        await module.run({ force: true });
      });
      await page.waitForTimeout(250);
    },
    async connect() {
      await page.evaluate(async ({ base, passphrase }) => {
        const module = await import("/src/store/sync.js");
        return module.connect(base, passphrase, { deviceName: "test" });
      }, { base: BASE, passphrase: PASSPHRASE });
    },
  };
}

const laptop = await device("laptop");
const phone = await device("phone", { width: 390, height: 844 });

await step("laptop connects and uploads its deck", async () => {
  await laptop.connect();
  await laptop.page.evaluate(async () => (await import("/src/store/sync.js")).uploadEverything());
  await laptop.page.waitForTimeout(900);
  await laptop.syncNow(); // a second pass settles the cursor past its own writes
  const state = await laptop.state();
  if (Object.keys(state.sync.dirty).length) throw new Error(`${Object.keys(state.sync.dirty).length} changes still queued`);
  if (!state.sync.cursor) throw new Error("no cursor recorded");
});

await step("phone adopts the laptop's data instead of its own sample", async () => {
  await phone.connect();
  await phone.page.evaluate(async () => (await import("/src/store/sync.js")).adoptServerCopy());
  await phone.page.waitForTimeout(1200);
  const [a, b] = [await laptop.state(), await phone.state()];
  if (b.tasks.length !== a.tasks.length) throw new Error(`phone has ${b.tasks.length} tasks, laptop has ${a.tasks.length}`);
  if (b.pages.length !== a.pages.length) throw new Error(`phone has ${b.pages.length} pages, laptop has ${a.pages.length}`);
  const entriesA = a.pages.reduce((n, p) => n + p.records.length, 0);
  const entriesB = b.pages.reduce((n, p) => n + p.records.length, 0);
  if (entriesA !== entriesB) throw new Error(`entries differ: ${entriesA} vs ${entriesB}`);
});

await step("a task added on the phone reaches the laptop", async () => {
  await phone.page.evaluate(async () => {
    const actions = await import("/src/store/actions.js");
    actions.createTask({ title: "Bought milk on the way home" });
  });
  await phone.syncNow();
  await laptop.syncNow();
  const found = (await laptop.state()).tasks.some((t) => t.title === "Bought milk on the way home");
  if (!found) throw new Error("the laptop never saw it");
});

await step("edits to different things do not clobber each other", async () => {
  const state = await laptop.state();
  const [first, second] = state.tasks.slice(0, 2);
  await laptop.page.evaluate(async (id) => {
    (await import("/src/store/actions.js")).updateTask(id, { title: "Renamed on the laptop" });
  }, first.id);
  await phone.page.evaluate(async (id) => {
    (await import("/src/store/actions.js")).updateTask(id, { title: "Renamed on the phone" });
  }, second.id);
  await laptop.syncNow();
  await phone.syncNow();
  await laptop.syncNow();
  for (const dev of [laptop, phone]) {
    const tasks = (await dev.state()).tasks;
    const a = tasks.find((t) => t.id === first.id)?.title;
    const b = tasks.find((t) => t.id === second.id)?.title;
    if (a !== "Renamed on the laptop" || b !== "Renamed on the phone") {
      throw new Error(`${dev.label} sees "${a}" / "${b}"`);
    }
  }
});

await step("the same task edited on both: the later edit wins", async () => {
  const id = (await laptop.state()).tasks[0].id;
  await laptop.page.evaluate(async (taskId) => {
    (await import("/src/store/actions.js")).updateTask(taskId, { title: "Laptop wrote first" });
  }, id);
  await laptop.page.waitForTimeout(60);
  await phone.page.evaluate(async (taskId) => {
    (await import("/src/store/actions.js")).updateTask(taskId, { title: "Phone wrote second" });
  }, id);
  await laptop.syncNow();
  await phone.syncNow();
  await laptop.syncNow();
  const title = (await laptop.state()).tasks.find((t) => t.id === id)?.title;
  if (title !== "Phone wrote second") throw new Error(`laptop kept "${title}"`);
});

await step("habit ticks from both devices both survive", async () => {
  const habitId = (await laptop.state()).habits[0].id;
  await laptop.page.evaluate(async ({ id }) => {
    (await import("/src/store/actions.js")).toggleHabitDay(id, "2026-01-05");
  }, { id: habitId });
  await phone.page.evaluate(async ({ id }) => {
    (await import("/src/store/actions.js")).toggleHabitDay(id, "2026-01-06");
  }, { id: habitId });
  await laptop.syncNow();
  await phone.syncNow();
  await laptop.syncNow();
  await phone.syncNow();
  for (const dev of [laptop, phone]) {
    const log = (await dev.state()).habits.find((x) => x.id === habitId).log;
    if (!log["2026-01-05"] || !log["2026-01-06"]) {
      throw new Error(`${dev.label} lost a tick: ${JSON.stringify({ a: log["2026-01-05"], b: log["2026-01-06"] })}`);
    }
  }
});

await step("a journal entry written on the phone reaches the laptop", async () => {
  const pageId = (await phone.state()).pages.find((p) => p.template === "journal").id;
  await phone.page.evaluate(async ({ id }) => {
    const actions = await import("/src/store/actions.js");
    const recordId = actions.createRecord(id, {});
    const state = JSON.parse(localStorage.getItem("dezk.state.v1"));
    const page = state.pages.find((p) => p.id === id);
    const field = page.fields.find((f) => f.type === "longtext");
    actions.updateRecord(id, recordId, { [field.id]: "Written on the train." });
  }, { id: pageId });
  await phone.syncNow();
  await laptop.syncNow();
  const page = (await laptop.state()).pages.find((p) => p.id === pageId);
  const hit = page.records.some((r) => Object.values(r.values).includes("Written on the train."));
  if (!hit) throw new Error("the entry never arrived");
});

await step("a deletion on the laptop removes it from the phone", async () => {
  const doomed = (await laptop.state()).tasks.find((t) => t.title === "Bought milk on the way home");
  await laptop.page.evaluate(async (id) => {
    (await import("/src/store/actions.js")).deleteTask(id);
  }, doomed.id);
  await laptop.syncNow();
  await phone.syncNow();
  const stillThere = (await phone.state()).tasks.some((t) => t.id === doomed.id);
  if (stillThere) throw new Error("the phone still has it");
});

await step("edits made offline are queued and sent on reconnect", async () => {
  await phone.page.context().setOffline(true);
  await phone.page.evaluate(async () => {
    (await import("/src/store/actions.js")).createTask({ title: "Written with no signal" });
  });
  await phone.page.waitForTimeout(400);
  const queued = Object.keys((await phone.state()).sync.dirty).length;
  if (!queued) throw new Error("nothing was queued while offline");

  await phone.page.context().setOffline(false);
  await phone.syncNow();
  await laptop.syncNow();
  const arrived = (await laptop.state()).tasks.some((t) => t.title === "Written with no signal");
  if (!arrived) throw new Error("the queued change never reached the laptop");
  await phone.syncNow();
  const left = Object.keys((await phone.state()).sync.dirty).length;
  if (left) throw new Error(`${left} changes are still queued after reconnecting`);
});

await step("a reload on the phone keeps the synced data", async () => {
  const before = (await phone.state()).tasks.length;
  await phone.page.reload({ waitUntil: "networkidle" });
  await phone.page.waitForTimeout(600);
  const after = (await phone.state()).tasks.length;
  if (after !== before) throw new Error(`${before} tasks before the reload, ${after} after`);
});

await step("the sync pill reports the connection", async () => {
  const label = await laptop.page.locator(".syncpill").innerText();
  if (!/Synced|Up to date|to send/i.test(label)) throw new Error(`pill says "${label}"`);
});

await browser.close();
console.log(errors.length ? `\n${errors.length} problem(s):\n${errors.join("\n")}` : "\nall clean");
if (errors.length) process.exit(1);
