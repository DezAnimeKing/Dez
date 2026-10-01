#!/usr/bin/env python3
"""
Obsidian <-> Excel bridge for the XO Nights vault.

  Vault -> Excel (inputs only, never formulas):
    * money lines in daily notes   -> Ultimate_Budget_Planner.xlsx  › Manual Log
    * dated tasks anywhere          -> Task_Habit_Tracker.xlsx       › Variable Tasks
    * ## Habits checkboxes          -> Task_Habit_Tracker.xlsx       › Habit Tracker
    * mood property                 -> Task_Habit_Tracker.xlsx       › Habit Tracker (mood row)
    * gratitude property            -> Task_Habit_Tracker.xlsx       › Gratitude Log
  Excel -> Vault (read-only, from the values Excel last saved):
    * 03 Money/Budget Snapshot.md   (month budget vs actual, accounts, savings, debt)
    * 02 Tasks/Excel Agenda.md      (recurring + Excel-only tasks, next 14 days)

Rows the script writes are tagged "↻ vault", so anything you typed straight into Excel is kept.
Standard library only (Python 3.8+). Close the workbooks in Excel before running.
"""
import datetime as dt
import json
import re
import shutil
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
VAULT = HERE.parents[1]
MARK = "↻ vault"
NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
M = "{%s}" % NS_MAIN
EPOCH = dt.date(1899, 12, 30)


# =============================================================== xlsx helpers (stdlib only)
def col_to_num(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def num_to_col(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def split_ref(ref):
    m = re.match(r"([A-Z]+)(\d+)$", ref)
    return m.group(1), int(m.group(2))


def to_serial(d):
    if isinstance(d, dt.datetime):
        d = d.date()
    return (d - EPOCH).days


def from_serial(v):
    try:
        return EPOCH + dt.timedelta(days=int(float(v)))
    except (TypeError, ValueError):
        return None


class Sheet:
    """Edits <sheetData> of one worksheet while leaving the rest of the XML byte-for-byte intact."""

    def __init__(self, book, path):
        self.book, self.path = book, path
        self.text = book.files[path].decode("utf-8")
        root_start = re.search(r"<worksheet\b[^>]*>", self.text).group(0)
        for prefix, uri in re.findall(r'xmlns(?::(\w+))?="([^"]+)"', root_start):
            ET.register_namespace(prefix or "", uri)
        m = re.search(r"<sheetData\s*/>|<sheetData\b[^>]*>.*?</sheetData>", self.text, re.S)
        self.span = m.span()
        frag = m.group(0)
        self.open_tag = re.match(r"<sheetData\b[^>]*?/?>", frag).group(0).replace("/>", ">")
        wrapped = root_start + (frag if not frag.endswith("/>") else self.open_tag + "</sheetData>") + "</worksheet>"
        self.data = ET.fromstring(wrapped).find(M + "sheetData")
        self.rows = {int(r.get("r")): r for r in self.data.findall(M + "row")}
        self.dirty = False

    # ---------- read
    def get(self, ref):
        c = self._cell(ref, create=False)
        if c is None:
            return None
        t = c.get("t")
        if t == "inlineStr":
            return "".join(x.text or "" for x in c.iter(M + "t"))
        v = c.find(M + "v")
        if v is None or v.text is None:
            return None
        if t == "s":
            return self.book.sst[int(v.text)]
        if t in ("str", "e"):
            return v.text
        if t == "b":
            return v.text == "1"
        try:
            f = float(v.text)
            return int(f) if f.is_integer() else f
        except ValueError:
            return v.text

    def has_formula(self, ref):
        c = self._cell(ref, create=False)
        return c is not None and c.find(M + "f") is not None

    # ---------- write
    def set(self, ref, value):
        if self.has_formula(ref):
            raise ValueError(f"{self.path}:{ref} holds a formula — refusing to overwrite")
        c = self._cell(ref, create=True)
        for child in list(c):
            c.remove(child)
        c.attrib.pop("t", None)
        if value is None or value == "":
            pass
        elif isinstance(value, bool):
            c.set("t", "b")
            ET.SubElement(c, M + "v").text = "1" if value else "0"
        elif isinstance(value, (int, float)):
            ET.SubElement(c, M + "v").text = repr(value)
        else:
            c.set("t", "inlineStr")
            is_ = ET.SubElement(c, M + "is")
            t = ET.SubElement(is_, M + "t")
            t.text = str(value)
            if str(value) != str(value).strip():
                t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        self.dirty = True

    def _cell(self, ref, create):
        letters, rn = split_ref(ref)
        row = self.rows.get(rn)
        if row is None:
            if not create:
                return None
            row = ET.Element(M + "row", {"r": str(rn)})
            later = [k for k in self.rows if k > rn]
            if later:
                idx = list(self.data).index(self.rows[min(later)])
                self.data.insert(idx, row)
            else:
                self.data.append(row)
            self.rows[rn] = row
        cn = col_to_num(letters)
        for i, c in enumerate(row.findall(M + "c")):
            cl, _ = split_ref(c.get("r"))
            n = col_to_num(cl)
            if n == cn:
                return c
            if n > cn:
                if not create:
                    return None
                new = ET.Element(M + "c", {"r": ref})
                self._copy_style(new, letters, rn)
                row.insert(list(row).index(c), new)
                return new
        if not create:
            return None
        new = ET.SubElement(row, M + "c", {"r": ref})
        self._copy_style(new, letters, rn)
        return new

    def _copy_style(self, cell, letters, rn):
        above = self._cell(f"{letters}{rn-1}", create=False) if rn > 1 else None
        if above is not None and above.get("s"):
            cell.set("s", above.get("s"))

    def serialize(self):
        xml = ET.tostring(self.data, encoding="unicode")
        xml = re.sub(r"^<sheetData\b[^>]*>", self.open_tag, xml, count=1)
        if xml.endswith("/>") and "</sheetData>" not in xml:
            xml = self.open_tag + "</sheetData>"
        return self.text[: self.span[0]] + xml + self.text[self.span[1]:]


class Book:
    def __init__(self, path):
        self.path = Path(path)
        with zipfile.ZipFile(self.path) as z:
            self.order = z.namelist()
            self.files = {n: z.read(n) for n in self.order}
        wb = ET.fromstring(self.files["xl/workbook.xml"])
        rels = ET.fromstring(self.files["xl/_rels/workbook.xml.rels"])
        target = {r.get("Id"): r.get("Target") for r in rels.findall("{%s}Relationship" % NS_PKG)}
        self.sheet_paths = {}
        for s in wb.find(M + "sheets"):
            t = target[s.get("{%s}id" % NS_REL)].lstrip("/")
            self.sheet_paths[s.get("name")] = t if t.startswith("xl/") else "xl/" + t
        self.sst = []
        if "xl/sharedStrings.xml" in self.files:
            for si in ET.fromstring(self.files["xl/sharedStrings.xml"]).findall(M + "si"):
                self.sst.append("".join(x.text or "" for x in si.iter(M + "t")))
        self.sheets = {}

    def sheet(self, name):
        if name not in self.sheets:
            self.sheets[name] = Sheet(self, self.sheet_paths[name])
        return self.sheets[name]

    def save(self, backup_dir=None):
        if not any(s.dirty for s in self.sheets.values()):
            return False
        if backup_dir:
            backup_dir.mkdir(parents=True, exist_ok=True)
            stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
            shutil.copy2(self.path, backup_dir / f"{self.path.stem}.{stamp}.bak.xlsx")
            olds = sorted(backup_dir.glob(f"{self.path.stem}.*.bak.xlsx"))
            for old in olds[:-5]:
                old.unlink()
        for s in self.sheets.values():
            if s.dirty:
                self.files[s.path] = s.serialize().encode("utf-8")
        wbx = self.files["xl/workbook.xml"].decode("utf-8")
        if "<calcPr" in wbx and "fullCalcOnLoad" not in wbx:
            wbx = wbx.replace("<calcPr", '<calcPr fullCalcOnLoad="1"', 1)
            self.files["xl/workbook.xml"] = wbx.encode("utf-8")
        tmp = self.path.with_suffix(".tmp.xlsx")
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
            for n in self.order:
                z.writestr(n, self.files[n])
        tmp.replace(self.path)
        return True


# =============================================================== vault parsing
FIELD = re.compile(r"\[([\w-]+)::\s*([^\]]*)\]")
TASK = re.compile(r"^\s*[-*+] \[(.)\] (.*)$")
MONEY_TYPES = {"spend": "Variable Exp", "income": "Income", "bill": "Bills", "save": "Savings",
               "transfer": "Transfer", "debt": "Debt", "sub": "Subscriptions"}
PRIORITY = [("🔺", "1-Urgent"), ("⏫", "2-High"), ("🔼", "3-Medium"), ("🔽", "4-Low"), ("⏬", "4-Low")]
STATUS = {"x": "Done", "X": "Done", "/": "In Progress", "-": "Cancelled", ">": "Waiting", "?": "On Hold"}


def frontmatter(text):
    meta, body = {}, text
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            for line in text[3:end].splitlines():
                m = re.match(r"^([\w-]+):\s*(.*)$", line)
                if m:
                    v = m.group(2).strip()
                    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                        v = v[1:-1]
                    meta[m.group(1)] = v
            body = text[end + 4:]
    return meta, body


def sections(body):
    """Yields (heading, line) pairs — heading is the latest ## heading text."""
    head = ""
    for line in body.splitlines():
        m = re.match(r"^#{1,6}\s+(.*)$", line)
        if m:
            head = m.group(1).strip()
        yield head, line


def parse_time(s):
    m = re.match(r"^\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?\s*$", s or "", re.I)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if m.group(3):
        h = h % 12 + (12 if m.group(3).lower() == "pm" else 0)
    return (h * 60 + mi) / 1440


def note_date(path, meta):
    for cand in (meta.get("date", ""), path.stem):
        try:
            return dt.date.fromisoformat(cand[:10])
        except ValueError:
            pass
    return None


def scan_vault(cfg, categories):
    daily_dir = VAULT / cfg["daily_folder"]
    skip = [VAULT / f for f in cfg["exclude_folders"]] + [VAULT / p for p in cfg["generated_notes"]]
    money, tasks, habits, moods, gratitude = [], [], {}, {}, {}
    cat_lookup = {c.lower(): c for c in categories if c}
    for path in sorted(VAULT.rglob("*.md")):
        if any(path == s or s in path.parents for s in skip):
            continue
        rel = path.relative_to(VAULT).as_posix()
        meta, body = frontmatter(path.read_text(encoding="utf-8"))
        is_daily = daily_dir in path.parents
        day = note_date(path, meta) if is_daily else None
        if is_daily and day:
            if meta.get("mood", "").strip().isdigit():
                moods[day] = int(meta["mood"])
            if meta.get("gratitude", "").strip():
                gratitude[day] = meta["gratitude"].strip()
        for head, line in sections(body):
            if is_daily and day and head.lower() == "habits":
                m = TASK.match(line)
                if m:
                    habits.setdefault(day, {})[m.group(2).strip()] = m.group(1).lower() == "x"
                continue
            fields = {k.lower(): v.strip() for k, v in FIELD.findall(line)}
            mtype = next((k for k in MONEY_TYPES if k in fields), None)
            if mtype and is_daily and day and line.lstrip().startswith(("-", "*", "+")):
                try:
                    amount = float(re.sub(r"[^\d.\-]", "", fields[mtype]))
                except ValueError:
                    continue
                note = FIELD.sub("", re.sub(r"^\s*[-*+]\s*", "", line)).strip()
                acct = fields.get("acct") or fields.get("from") or cfg["default_account"]
                cat = MONEY_TYPES[mtype]
                frm, to = (("N/A", acct) if cat == "Income" else (acct, fields.get("to", "N/A")))
                money.append({"date": day, "cat": cat, "sub": fields.get("cat", ""), "amount": amount, "from": frm,
                              "to": to, "desc": f"{MARK} · {note} ({path.stem})"})
                continue
            m = TASK.match(line)
            if not m:
                continue
            status_ch, text = m.group(1), m.group(2)
            due = re.search(r"📅\s*(\d{4}-\d{2}-\d{2})", text) or re.search(r"⏳\s*(\d{4}-\d{2}-\d{2})", text)
            due = dt.date.fromisoformat(due.group(1)) if due else day
            if not due:
                continue
            tags = [t.lower() for t in re.findall(r"#([\w/-]+)", text)]
            prio = next((p for e, p in PRIORITY if e in text), "3-Medium")
            clean = FIELD.sub("", text)
            clean = re.sub(r"[📅⏳🛫✅➕❌]\s*\d{4}-\d{2}-\d{2}", "", clean)
            clean = re.sub(r"🔁[^📅⏳🛫✅➕#\[]*", "", clean)
            clean = re.sub(r"#[\w/-]+", "", clean)
            for e, _ in PRIORITY:
                clean = clean.replace(e, "")
            clean = re.sub(r"\s+", " ", clean.replace("⭐", "")).strip()
            if not clean:
                continue
            prog = fields.get("progress", "").rstrip("%")
            tasks.append({
                "task": clean, "cat": next((cat_lookup[t] for t in tags if t in cat_lookup), ""), "due": due,
                "start": parse_time(fields.get("start")), "end": parse_time(fields.get("end")),
                "status": STATUS.get(status_ch, "Not Started"),
                "progress": (1.0 if status_ch.lower() == "x" else (float(prog) / 100 if prog.replace(".", "").isdigit() else None)),
                "priority": prio, "important": "✓" if ("important" in tags or "⭐" in text) else "",
                "person": fields.get("person", ""), "notes": f"{MARK} · {rel}"})
    return money, tasks, habits, moods, gratitude


# =============================================================== Excel -> vault
def pull_budget(book, cfg):
    jan = book.sheet("Jan")
    if jan.get("C6") is None:
        return None
    months, today = [], dt.date.today()
    current = None
    for name in ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]:
        s = book.sheet(name)
        start, end = from_serial(s.get("C6")), from_serial(s.get("C7"))
        row = {"month": start.strftime("%B %Y") if start else name,
               "budget": [s.get(f"C{r}") or 0 for r in range(14, 20)],
               "actual": [s.get(f"D{r}") or 0 for r in range(14, 20)],
               "end_balance": s.get("J8") or 0, "left": s.get("J9") or 0}
        months.append(row)
        if start and end and start <= today <= end:
            current = row
    current = current or months[-1]
    acc = book.sheet("Accounts")
    accounts = [(acc.get(f"B{r}"), acc.get(f"F{r}") or 0) for r in range(6, 18) if acc.get(f"B{r}")]
    sv = book.sheet("Savings")
    funds = [(sv.get(f"B{r}"), sv.get(f"C{r}") or 0, sv.get(f"G{r}") or 0, sv.get(f"I{r}") or 0)
             for r in range(6, 26) if sv.get(f"B{r}")]
    dp = book.sheet("Debt Payoff")
    debt_free = dp.get("G5")
    debt_free = from_serial(debt_free).strftime("%B %Y") if isinstance(debt_free, (int, float)) else (debt_free or "")
    b, a = current["budget"], current["actual"]
    money = lambda v: f"-${abs(v):,.0f}" if v < 0 else f"${v:,.0f}"
    fm = {"synced": dt.datetime.now().strftime("%Y-%m-%d %H:%M"), "month": current["month"],
          "income": round(a[0], 2), "income_budget": round(b[0], 2),
          "savings": round(a[1], 2), "savings_budget": round(b[1], 2),
          "expenses": round(sum(a[2:]), 2), "expense_budget": round(sum(b[2:]), 2),
          "variable_actual": round(a[5], 2), "variable_budget": round(b[5], 2),
          "left_to_spend": round(current["left"], 2), "net_worth": round(sum(v for _, v in accounts), 2),
          "debt_free": debt_free, "total_interest": round(dp.get("G7") or 0, 2)}
    lines = ["---"] + [f"{k}: {json.dumps(v, ensure_ascii=False) if isinstance(v, str) else v}" for k, v in fm.items()]
    lines += ["cssclasses:", "  - dawn-fm", "---", "![[banner-dawn-fm.svg|banner]]", "",
              "# Budget Snapshot", f"> [!dawn-fm] Pulled from Excel · {fm['synced']}",
              "> Generated by the Excel sync — edits here are overwritten. Change numbers in the workbook.", "",
              f"## {current['month']}", "| | Budget | Actual |", "|---|---:|---:|"]
    for i, k in enumerate(["Income", "Savings", "Bills", "Debt", "Subscriptions", "Variable"]):
        lines.append(f"| {k} | {money(b[i])} | {money(a[i])} |")
    lines += [f"| **Left to spend** | | **{money(current['left'])}** |", "",
              "## Year", "| Month | Income | Expenses | Savings | End balance |", "|---|---:|---:|---:|---:|"]
    for mo in months:
        lines.append(f"| {mo['month']} | {money(mo['actual'][0])} | {money(sum(mo['actual'][2:]))} | "
                     f"{money(mo['actual'][1])} | {money(mo['end_balance'])} |")
    lines += ["", "## Accounts", "| Account | Balance |", "|---|---:|"]
    lines += [f"| {n} | {money(v)} |" for n, v in accounts]
    lines += [f"| **Net worth** | **{money(fm['net_worth'])}** |", "", "## Sinking funds",
              "| Fund | Goal | Saved | Progress |", "|---|---:|---:|---|"]
    lines += [f"| {n} | {money(g)} | {money(s)} | <progress value=\"{p}\" max=\"1\"></progress> {p:.0%} |"
              for n, g, s, p in funds]
    lines += ["", f"**Debt-free:** {debt_free} · total interest {money(fm['total_interest'])}", ""]
    return "\n".join(lines)


def pull_agenda(book, days=14):
    rl, vt = book.sheet("Recurring Log"), book.sheet("Variable Tasks")
    if rl.get("E6") is None and rl.get("C6") is None:
        return None
    today = dt.date.today()
    items = []
    for sheet, last, src in ((rl, 1505, "recurring"), (vt, 505, "excel")):
        for r in range(6, last + 1):
            task = sheet.get(f"C{r}")
            if not task:
                if sheet is rl:
                    break
                continue
            notes = str(sheet.get(f"P{r}") or "")
            if notes.startswith(MARK):
                continue
            due = from_serial(sheet.get(f"E{r}"))
            status = sheet.get(f"J{r}") or "Not Started"
            if not due or status in ("Done", "Cancelled"):
                continue
            if due < today or (due - today).days <= days:
                start = sheet.get(f"G{r}")
                t = "" if not isinstance(start, (int, float)) else (dt.datetime(2000, 1, 1) + dt.timedelta(days=start)).strftime("%H:%M")
                items.append((due, t, task, sheet.get(f"D{r}") or "", sheet.get(f"L{r}") or "", status, src))
    items.sort()
    lines = ["---", f"synced: {dt.datetime.now().strftime('%Y-%m-%d %H:%M')}", "cssclasses:", "  - after-hours", "---",
             "# Excel Agenda", "> [!after-hours] Recurring & Excel-only tasks · overdue + next 14 days",
             "> Generated by the Excel sync (read-only). Update status in Excel ▸ Recurring Log.", "",
             "| Due | Time | Task | Category | Priority | Status | Source |", "|---|---|---|---|---|---|---|"]
    for due, t, task, cat, pr, st, src in items:
        flag = " 🔥" if due < today else (" 🌙" if due == today else "")
        lines.append(f"| {due:%a %d %b}{flag} | {t} | {task} | {cat} | {pr} | {st} | {src} |")
    if not items:
        lines.append("| — | | nothing scheduled | | | | |")
    return "\n".join(lines) + "\n"


# =============================================================== vault -> Excel
def push_money(book, money):
    ws = book.sheet("Manual Log")
    keep = []
    for r in range(6, 1006):
        d = ws.get(f"B{r}")
        desc = str(ws.get(f"H{r}") or "")
        if d is None or desc.startswith(MARK):
            continue
        keep.append([ws.get(f"{c}{r}") for c in "BCDEFGH"])
    new = [[to_serial(m["date"]), m["cat"], m["sub"], m["amount"], m["from"], m["to"], m["desc"]] for m in money]
    rows = sorted(keep + new, key=lambda x: (x[0] if isinstance(x[0], (int, float)) else 0))
    if len(rows) > 1000:
        raise SystemExit(f"Manual Log would need {len(rows)} rows (max 1000) — archive older entries first.")
    for i in range(1000):
        r = 6 + i
        vals = rows[i] if i < len(rows) else [None] * 7
        if i >= len(rows) and ws.get(f"B{r}") is None and ws.get(f"C{r}") is None:
            continue
        for c, v in zip("BCDEFGH", vals):
            ws.set(f"{c}{r}", v)
    return len(new), len(keep)


def push_tasks(book, tasks):
    ws = book.sheet("Variable Tasks")
    cols = "CDEGHJKLMNP"
    keep = []
    for r in range(6, 506):
        if not ws.get(f"C{r}") or str(ws.get(f"P{r}") or "").startswith(MARK):
            continue
        keep.append([ws.get(f"{c}{r}") for c in cols])
    new = [[t["task"], t["cat"], to_serial(t["due"]), t["start"], t["end"], t["status"], t["progress"], t["priority"],
            t["important"], t["person"], t["notes"]] for t in tasks]
    rows = keep + sorted(new, key=lambda x: x[2])
    if len(rows) > 500:
        raise SystemExit(f"Variable Tasks would need {len(rows)} rows (max 500).")
    for i in range(500):
        r = 6 + i
        vals = rows[i] if i < len(rows) else [None] * len(cols)
        if i >= len(rows) and not ws.get(f"C{r}") and not ws.get(f"P{r}"):
            continue
        for c, v in zip(cols, vals):
            ws.set(f"{c}{r}", v)
    return len(new), len(keep)


def push_habits(book, habits, moods):
    ws, setup = book.sheet("Habit Tracker"), book.sheet("Setup")
    start = from_serial(setup.get("D5"))
    if not start:
        return 0
    start -= dt.timedelta(days=start.weekday())            # tracker weeks start on Monday
    rows = {str(ws.get(f"B{r}")).strip().lower(): r for r in range(9, 24) if ws.get(f"B{r}")}
    n = 0
    for day, marks in habits.items():
        off = (day - start).days
        if not 0 <= off < 364:
            continue
        col = num_to_col(5 + off)
        for name, done in marks.items():
            r = rows.get(name.strip().lower())
            if r:
                ws.set(f"{col}{r}", "✓" if done else None)
                n += 1
    for day, mood in moods.items():
        off = (day - start).days
        if 0 <= off < 364 and 1 <= mood <= 5:
            ws.set(f"{num_to_col(5 + off)}28", mood)
    return n


def push_gratitude(book, gratitude):
    ws = book.sheet("Gratitude Log")
    by_date, empty = {}, []
    for r in range(6, 401):
        v = ws.get(f"B{r}")
        if isinstance(v, (int, float)):
            by_date[int(v)] = r
        elif v in (None, ""):
            empty.append(r)
    n = 0
    for day, text in sorted(gratitude.items()):
        s = to_serial(day)
        r = by_date.get(s)
        if r is None:
            if not empty:
                break
            r = empty.pop(0)
            ws.set(f"B{r}", s)
        ws.set(f"C{r}", text)
        n += 1
    return n


# =============================================================== main
def main():
    cfg = json.loads((HERE / "sync_config.json").read_text(encoding="utf-8"))
    def find(rel):
        """Configured path first, then the vault's Excel/ folder, then a sibling spreadsheets/ folder."""
        name = Path(rel).name
        for cand in (VAULT / rel, VAULT / "Excel" / name, VAULT.parent / "spreadsheets" / name):
            if cand.exists():
                return cand.resolve()
        return (VAULT / rel).resolve()

    budget_path = find(cfg["budget_workbook"])
    tasks_path = find(cfg["tasks_workbook"])
    backups = HERE / "backups" if cfg.get("backup", True) else None
    dry = "--dry-run" in sys.argv
    print("XO NIGHTS · excel bridge ·", dt.datetime.now().strftime("%Y-%m-%d %H:%M"))

    books = {}
    for key, path in (("budget", budget_path), ("tasks", tasks_path)):
        if path.exists():
            books[key] = Book(path)
        else:
            print(f"  ! {key} workbook not found: {path}  (edit sync_config.json)")

    categories = []
    if "tasks" in books:
        s = books["tasks"].sheet("Setup")
        categories = [s.get(f"F{r}") for r in range(6, 16)]
    money, tasks, habits, moods, gratitude = scan_vault(cfg, categories)
    print(f"  vault: {len(money)} money lines · {len(tasks)} dated tasks · {len(habits)} habit days · "
          f"{len(moods)} moods · {len(gratitude)} gratitude entries")

    # ---- Excel -> vault (uses values Excel saved last time)
    if cfg.get("pull_from_excel", True):
        if "budget" in books:
            snap = pull_budget(books["budget"], cfg)
            if snap:
                (VAULT / "03 Money/Budget Snapshot.md").write_text(snap, encoding="utf-8") if not dry else None
                print("  ← Budget Snapshot updated")
            else:
                print("  ← budget: no saved values yet — open the workbook in Excel, save, then sync again")
        if "tasks" in books:
            agenda = pull_agenda(books["tasks"])
            if agenda:
                (VAULT / "02 Tasks/Excel Agenda.md").write_text(agenda, encoding="utf-8") if not dry else None
                print("  ← Excel Agenda updated")
            else:
                print("  ← tasks: no saved values yet — open the workbook in Excel, save, then sync again")

    # ---- vault -> Excel
    if cfg.get("push_to_excel", True):
        if "budget" in books:
            added, kept = push_money(books["budget"], money)
            print(f"  → Manual Log: {added} vault rows (+{kept} Excel rows kept)")
        if "tasks" in books:
            added, kept = push_tasks(books["tasks"], tasks)
            print(f"  → Variable Tasks: {added} vault rows (+{kept} Excel rows kept)")
            print(f"  → Habit Tracker: {push_habits(books['tasks'], habits, moods)} habit ticks")
            print(f"  → Gratitude Log: {push_gratitude(books['tasks'], gratitude)} entries")
        if dry:
            print("  (dry run — nothing written)")
        else:
            for key, b in books.items():
                try:
                    if b.save(backups):
                        print(f"  ✓ saved {b.path.name}")
                except PermissionError:
                    print(f"  ! {b.path.name} is open in Excel — close it and run again")
    print("done.")


if __name__ == "__main__":
    main()
