"""Writes sample daily notes (Sep 2026) so the dashboards have something to show. Safe to delete them."""
import datetime as dt
import random
from pathlib import Path

VAULT = Path(__file__).resolve().parents[2]
TEMPLATE_HABITS = ["Sleep 7 hours", "Make up bed", "10 min Meditation", "Drink 2L of water", "15 min stretching",
                   "Walk min 7000 steps", "50 x Push Ups", "Eat 5 serves of fruit & veg", "No coffee after 2pm",
                   "No eating after 7pm", "Read for 20 min", "Gratitude list: write 3 things", "Positive affirmations",
                   "Don't use phone before bed", "In bed before 10pm"]
SONGS = ["Blinding Lights", "Out of Time", "Kiss Land", "Sacrifice", "After Hours", "Wanderlust", "Take My Breath",
         "Save Your Tears", "Less Than Zero", "Plastic Love — Mariya Takeuchi", "Mayonaka no Door — Miki Matsubara",
         "Gasoline", "Belong to the World", "Is There Someone Else?"]
GRAT = ["A slow coffee and a clear head.", "Lunch with Amy and a proper laugh.", "Finishing the proposal draft early.",
        "Sam helping with dinner.", "A sunny walk at lunchtime.", "Clear direction and a productive mindset.",
        "My health and a good night's sleep.", "Late-night drive with the windows down.", "Rain on the window while reading."]
SPEND = [("Groceries", 35, 140, "Credit Card 1"), ("Eating Out", 12, 70, "Credit Card 1"), ("Shopping", 20, 120, "Credit Card 2"),
         ("Transportation", 20, 60, "Checking 1"), ("Entertainment", 15, 50, "Credit Card 2"), ("Pets", 20, 60, "Checking 1")]
PLACES = {"Groceries": "Trader Joe's", "Eating Out": "ramen after work", "Shopping": "records & a jacket",
          "Transportation": "gas", "Entertainment": "cinema", "Pets": "cat food"}
TASKS = [("Respond to emails", "#business", "🔺"), ("Track weekly goals", "#personal #important", "⏫"),
         ("Clean kitchen", "#family", "🔽"), ("Call client", "#business #important", "⏫"), ("Running", "#health", "🔼"),
         ("Declutter desk", "#personal", "🔽"), ("Plan weekend away", "#family #important", "🔼")]

rng = random.Random(21)
today = dt.date(2026, 9, 29)
out = VAULT / "01 Daily"
out.mkdir(exist_ok=True)
for i in range(28, -1, -1):
    d = today - dt.timedelta(days=i)
    is_today = i == 0
    mood = rng.choice([3, 4, 4, 5, 3, 2, 4, 5])
    lines = ["---", f"date: {d.isoformat()}", f"mood: {mood}", f"energy: {rng.randint(2, 5)}",
             f'gratitude: "{rng.choice(GRAT)}"', f'now_playing: "{rng.choice(SONGS)}"', "cssclasses:", "  - kissland", "---",
             "![[banner-kissland.svg|banner]]", "",
             f"> [!dawn-fm] 📻 {d.strftime('%A · %-d %B %Y')}", "> **Main focus:** " + rng.choice(
                 ["ship the proposal", "deep work block", "reset the apartment", "plan the week", "rest"]), "", "## Tasks"]
    for t, tags, pr in rng.sample(TASKS, 2):
        done = "x" if (not is_today and rng.random() < 0.75) else " "
        lines.append(f"- [{done}] {t} {pr} {tags}" + (f" ✅ {d.isoformat()}" if done == "x" else ""))
    lines += ["", "## Habits"]
    for k, h in enumerate(TEMPLATE_HABITS):
        p = 0.35 if is_today else 0.55 + 0.03 * (k % 5)
        lines.append(f"- [{'x' if rng.random() < p else ' '}] {h}")
    lines += ["", "## Money"]
    for cat, lo, hi, acct in rng.sample(SPEND, rng.randint(0, 3)):
        lines.append(f"- [spend:: {rng.uniform(lo, hi):.2f}] [cat:: {cat}] [acct:: {acct}] {PLACES[cat]}")
    if d.day == 18:
        lines.append("- [income:: 1150] [cat:: Freelance Job] [acct:: Checking 1] logo project")
    lines += ["", "## Journal", "> [!after-hours] 午前三時 — what's on your mind",
              "> " + rng.choice(["City lights from the balcony. Quiet night.", "Long day, good music.",
                                 "Felt focused — kept the phone in the other room.", "Tired but proud of the progress."]), ""]
    (out / f"{d.isoformat()}.md").write_text("\n".join(lines), encoding="utf-8")
print("wrote sample days to", out)
