"""Writes 4 weeks of sample daily notes so Home and the strip have something to show. Delete Daily/* any time."""
import datetime as dt
import random
from pathlib import Path

VAULT = Path(__file__).resolve().parents[2]
TEMPLATE = (VAULT / "System/Templates/Daily.md").read_text(encoding="utf-8")
TASKS = ["Reply to emails", "Call client", "Clean kitchen", "Go for a run", "Pay phone bill", "Laundry",
         "Draft blog post", "Book dentist", "Plan weekend", "Tidy desk"]
SPEND = [("groceries", 30, 120), ("eating out", 12, 60), ("transportation", 20, 55), ("shopping", 20, 90),
         ("entertainment", 10, 40)]
GOOD = ["Coffee in the sun.", "Lunch with Amy.", "Finished the proposal early.", "Late-night drive, good music.",
        "Slept well.", "Rain on the window while reading.", "Sam made dinner."]

rng = random.Random(8)
today = dt.date(2026, 10, 8)
out = VAULT / "Daily"
out.mkdir(exist_ok=True)
for i in range(27, -1, -1):
    d = today - dt.timedelta(days=i)
    is_today = i == 0
    tick = lambda p: "x" if rng.random() < p else " "
    lines, sec = [], ""
    for line in TEMPLATE.splitlines():
        if line.startswith("## "):
            sec = line[3:].strip()
            lines.append(line)
            continue
        if sec == "Top 3" and line.startswith("- [ ]"):
            t = rng.choice(TASKS)
            lines.append(f"- [{' ' if is_today else tick(0.75)}] {t}")
        elif sec == "Habits" and line.startswith("- [ ]"):
            lines.append(f"- [{tick(0.3 if is_today else 0.65)}]" + line[5:])
        elif sec == "Mood" and line.startswith("- [ ]"):
            lines.append(line)
        elif sec == "Money" and line.strip() == "-":
            for cat, lo, hi in rng.sample(SPEND, rng.randint(0, 2)):
                lines.append(f"- {rng.uniform(lo, hi):.2f} {cat}")
            if d.day == 18:
                lines.append("- +1150 freelance logo project")
        elif sec == "One good thing" and line.strip() == "-":
            lines.append("- " + rng.choice(GOOD))
        else:
            lines.append(line)
    text = "\n".join(lines) + "\n"
    log = [f"- 0{rng.randint(5, 7)}:{rng.randint(0, 5)}{rng.randint(0, 9)} woke"]
    if rng.random() < 0.6:
        log.append(f"- 07:{rng.randint(10, 50)} walk Walk {rng.choice(['5K', '6.5K', '7.5K'])} · {rng.choice(['45m', '1h', '1h20'])}")
    if rng.random() < 0.5:
        log += ["- 08:30 gym Back day · 30m", "  - 3x Chin-Up · 19 reps", "  - 4x Dumbbell Row · 42 reps",
                "  - 2x Push-Up · 20 reps"]
    log.append(f"- 12:{rng.randint(10, 50)} meal {rng.choice(['Chicken rice bowl · 620kcal P45 C70 F14', 'Greens + collagen · 140kcal P15 C10 F3', 'Ramen · 780kcal P30 C95 F28'])}")
    if not is_today:
        log.append(f"- 2{rng.randint(2, 3)}:{rng.randint(10, 50)} sleep")
    text += "\n".join(log) + "\n"
    if not is_today or rng.random() < 1:
        mood = rng.choice([2, 3, 4, 4, 5, 3])
        text = text.replace(f"- [ ] {mood} ", f"- [x] {mood} ", 1)
    (out / f"{d.isoformat()}.md").write_text(text, encoding="utf-8")
print("wrote", out)
