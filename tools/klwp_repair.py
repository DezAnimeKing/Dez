#!/usr/bin/env python3
"""
Repair pass for the W11PER KLWP preset.

Fixes four classes of defect found by auditing preset.json, and rebuilds the
.klwp archive. Every change is counted and reported so the result is verifiable.

  A. icon_set references pointing into OTHER presets' archives
     (wallpapers/<other preset>.klwp/icons/FluentLY.ttf). Those paths only
     resolve if the user happens to have those presets installed under those
     exact names, so on a clean install the icons fall back to tofu/blank.
     Repointed at the FluentLY.ttf bundled inside this preset.

  B. U+FEFF (zero-width no-break space) baked into the accent-colour tables.
     It corrupts the hex values in color/color1 and the labels in
     color/selected, and is written into those globals by the one-tap theme
     buttons. Stripped everywhere; it is zero-width and carries no meaning in
     any context it appears in here, and removing it keeps both sides of every
     string comparison consistent.

  C. gv(widget/<x>po) -> gv(widgets/<x>po). Singular/plural typo in the five
     widget fade animations; the global is declared as widgets/<x>po.

  D. gv(widgets/<w>thsi) -> the theme/size pair that replaced it. The old
     global held theme and size together; it is now split into
     widgets/<w>th (1..4) and widgets/<w>si (S/M/L). Which one is meant is
     determined by the literal it is compared against.

  E. Drop fonts/Roboto-Regular.ttf: unreferenced and byte-identical to
     fonts/Roboto.ttf.
"""

import json
import re
import shutil
import sys
import zipfile
from collections import Counter
from pathlib import Path

BUNDLED_ICON_SET = "kfile://org.kustom.provider/icons/FluentLY.ttf"
FOREIGN_ICON_SET = re.compile(
    r"^kfile://org\.kustom\.provider/wallpapers/[^/]+/icons/FluentLY\.ttf$"
)
BOM = "﻿"
DROP_ENTRIES = {"fonts/Roboto-Regular.ttf"}

WIDGET_PO = re.compile(r"\bgv\(widget/((?:fit|cal|wea|bat|mus)po)\)")

# tc(count, gv(widgets/<w>thsi), <literal> ...
THSI = re.compile(
    r"(tc\(\s*count\s*,\s*)gv\(\s*widgets/(mus|bat|wea|cal)thsi\s*\)(\s*,\s*)([A-Za-z0-9]+)"
)
SIZE_LITERALS = {"S", "M", "L"}

stats = Counter()


def children(node):
    return node.get("viewgroup_items") or node.get("internal_children") or []


def fix_text(s):
    """Apply the string-level repairs (B, C, D) to one string."""
    if BOM in s:
        stats["B_bom_chars"] += s.count(BOM)
        s = s.replace(BOM, "")

    def po(m):
        stats["C_widget_po"] += 1
        return "gv(widgets/%s)" % m.group(1)

    s = WIDGET_PO.sub(po, s)

    def thsi(m):
        head, widget, sep, literal = m.groups()
        if literal in SIZE_LITERALS:
            target, kind = "widgets/%ssi" % widget, "size"
        else:
            target, kind = "widgets/%sth" % widget, "theme"
        stats["D_thsi_%s" % kind] += 1
        return "%sgv(%s)%s%s" % (head, target, sep, literal)

    return THSI.sub(thsi, s)


def walk(node):
    """Rewrite a module dict in place, depth first."""
    icon_set = node.get("icon_set")
    if isinstance(icon_set, str) and FOREIGN_ICON_SET.match(icon_set):
        node["icon_set"] = BUNDLED_ICON_SET
        stats["A_icon_set"] += 1

    for key in list(node.keys()):
        if key in ("viewgroup_items", "internal_children"):
            continue
        node[key] = transform(node[key])

    for child in children(node):
        walk(child)


def transform(value):
    """Apply string repairs through arbitrarily nested JSON values."""
    if isinstance(value, str):
        return fix_text(value)
    if isinstance(value, list):
        return [transform(v) for v in value]
    if isinstance(value, dict):
        return {fix_text(k) if isinstance(k, str) else k: transform(v)
                for k, v in value.items()}
    return value


def main(src, dst):
    src, dst = Path(src), Path(dst)
    work = dst.with_suffix(".preset.json")

    with zipfile.ZipFile(src) as z:
        preset = json.loads(z.read("preset.json").decode("utf-8"))
        entries = z.infolist()

    walk(preset["preset_root"])
    # preset_info sits outside preset_root but can carry the same junk.
    preset["preset_info"] = transform(preset["preset_info"])

    text = json.dumps(preset, indent=2, ensure_ascii=False)
    work.write_text(text, encoding="utf-8")

    with zipfile.ZipFile(src) as zin, \
         zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in entries:
            if info.filename in DROP_ENTRIES:
                stats["E_dropped_%s" % info.filename] += 1
                continue
            out = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            out.compress_type = zipfile.ZIP_DEFLATED
            out.external_attr = info.external_attr
            data = text.encode("utf-8") if info.filename == "preset.json" \
                else zin.read(info.filename)
            zout.writestr(out, data)

    work.unlink()
    for key in sorted(stats):
        print("  %-24s %d" % (key, stats[key]))
    print("\nwrote %s (%.1f MB)" % (dst, dst.stat().st_size / 1e6))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
