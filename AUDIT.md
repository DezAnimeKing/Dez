# W11PER build 14.2 — preset audit and repair

`W11PER update 1.f.klwp` ("W11PER"/Wiper, by Nux) is a 4,491-module Windows 11
KLWP preset: 540x1110, 4 screens, weather / analog clock / calendar / music /
fitness / signal / notifications / network / bluetooth.

Audit method: unpack the archive, parse `preset.json`, walk the module tree and
check every asset reference, icon name and `gv()` global reference against what
the preset actually ships. A formula only runs when its `internal_toggles` entry
for that field is `10`, so the audit distinguishes **live** expressions from
disabled ones — most of the apparent breakage is inert, and the numbers below
count only what the renderer evaluates.

## Fixed

### 1. 209 of 284 icons pointed into other presets' archives
`icon_set` on 209 `FontIconModule`s referenced a FluentLY font inside three
*different* presets:

| foreign archive | modules |
| --- | --- |
| `wallpapers/Win11_RM_build_1.klwp/icons/FluentLY.ttf` | 119 |
| `wallpapers/W11PERM_build_6.klwp.klwp/icons/FluentLY.ttf` | 85 |
| `wallpapers/W11PERM_build_2.klwp/icons/FluentLY.ttf` | 5 |

Those paths resolve only if the user happens to have those older presets
installed under those exact filenames, so on a clean install roughly three
quarters of the interface icons render blank. All 209 were repointed at the
`icons/FluentLY.ttf` this preset already bundles.

Safe because icons are referenced by *name*, and the bundled font is complete:
3,056 of 3,056 glyphs declared by `FluentLY.json` are present in the `.ttf`, and
206 of the 209 names resolve in it directly. The other 3 (`blur-16r`,
`globe-prohibited-20r`) are dead literals overridden by a live `icon_icon`
formula, so they never render — left alone rather than guessed at.

### 2. Zero-width characters corrupting the accent-colour system
396 U+FEFF (zero-width no-break space) characters were baked into the colour
tables, evidently pasted in from a source carrying a BOM:

- `color/color1`'s stored value was `<BOM>FF0078D4` — not a parseable hex
  colour. That global is consumed in **200** places.
- 21 of 50 entries in `color/color1` and 2 of 50 in `color/selected` carried a
  BOM *before* the opening quote, breaking the `"value"##Label` entry syntax.
- 33 of the one-tap theme buttons wrote `<BOM>FF0078D4` into `color/color1`, and
  4 wrote `<BOM>Red` into `color/selected`.

Stripped throughout. U+FEFF is zero-width and meaningless in every context it
appeared in here, and removing it globally keeps both sides of every string
comparison consistent. `color/color1` now reads `FF0078D4` and its entry parses
as `"FF0078D4"##Blue`.

### 3. `gv(widget/…po)` — singular/plural typo (5 sites)
The fade animation on all five widgets (fitness, calendar, weather, battery,
music) tested `gv(widget/fitpo)` etc., but the globals are declared
`widgets/fitpo`. The comparison never matched, so widget show/hide on the
widgets screen evaluated the wrong branch. Corrected to `widgets/…po`.

### 4. `gv(widgets/…thsi)` — global split in an earlier build (141 sites)
A single legacy global held each widget's theme *and* size. It was later split
into `widgets/<w>th` (1–4) and `widgets/<w>si` (S/M/L), but 141 references were
never updated. Which half is meant is unambiguous from the literal each is
compared against, and all 141 occurrences sit inside `tc(count, …)`, so the
rewrite is fully determined: 110 -> `…th`, 31 -> `…si`.

This was not only cosmetic. Besides the four settings labels rendering as a bare
" • ", the `Touch S` / `Touch M` hit targets were gated on
`tc(count,gv(widgets/mussi),S)>0`, which was always false — so the widget **size
buttons in the settings screen could never be tapped**.

### 5. Duplicate font dropped
`fonts/Roboto-Regular.ttf` was unreferenced and byte-identical (md5
`ac3f799d…`) to `fonts/Roboto.ttf`, which `font/0` actually points at. Removed;
saves 162 KB.

## Verified after the repair

- Module tree shape, module count (4,491), `preset_info` and all 133 global keys
  are unchanged; no asset other than the dropped duplicate differs by a byte.
- Every `kfile://` reference resolves to a file in the archive; no unused assets.
- No `FontIconModule` has an unresolvable literal icon name.
- 0 remaining U+FEFF, foreign `icon_set`, `widget/…po` or `…thsi` references.

## Left alone, deliberately

187 `gv()` references across 14 names still point at globals that no longer
exist — leftovers from earlier builds. They are **not** fixed here because the
correct replacement depends on the author's intent and a wrong guess would
silently change the preset's appearance.

Most are inert: 101 of the 112 `theme/textco1` references set
`fx_gradient_color` on shapes that have **no gradient mode set**, so the colour
is never painted.

| global | live refs | note |
| --- | --- | --- |
| `theme/textco1` | 112 | 101 inert (no gradient enabled); 11 visible |
| `theme/textco2` | 28 | mostly the wallpaper colour grid, below |
| `navbr/navpad` | 24 | nav bar padding |
| `widgets/battery`, `widgets/music` | 7 | same legacy family as `…thsi` |
| `appst/size` | 4 | |
| `color/theme`, `theme/main`, `corner`, `navbr/theme`, `theme/button0-3` | 12 | |

`theme/text` is a list (0 Normal, 1 slightly feint, 2 sub text, 3 feint, 4
inverted…), so `textco1`/`textco2` most likely map onto `gv(theme/text,N)` — but
nothing in the file pins down *which* index, and no modernised sibling exists to
copy from. Picking one is the author's call.

Separately, the **wallpaper colour grid** (`Settings • Wallpaper`) gates each
swatch's checkmark on `gv(wllpapr/switch)=Gold`, `=Red`, and so on, but
`wllpapr/switch` is a list of wallpaper slots (`wllpapr/0`…`wllpapr/9`), not
colour names. The comparison can never be true, so those checkmarks are always
transparent. That looks like an unfinished section rather than a typo, so it is
reported rather than rewritten.

Author metadata (`title`, `description`, `version`, the `sysinfo` build string)
was left untouched — bumping it would misrepresent a release the author did not
make.

## Reproducing

```
python3 tools/klwp_repair.py <input.klwp> <output.klwp>
```
