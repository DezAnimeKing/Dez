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
    if not is_today or rng.random() < 1:
        mood = rng.choice([2, 3, 4, 4, 5, 3])
        text = text.replace(f"- [ ] {mood} ", f"- [x] {mood} ", 1)
    (out / f"{d.isoformat()}.md").write_text(text, encoding="utf-8")
print("wrote", out)
