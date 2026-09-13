# Windows 11 (KLWP) — teardown & repair notes

Source: `Windows_11.klwp` — author Emir481, exported **2021-07-12** with Kustom
build `356114416` (all 47 zip entries carry the same timestamp, so the file is an
untouched original, not something half-edited).

Output: `Windows_11_fixed.klwp` (all 46 asset files byte-identical to the
original; only `preset.json` changed).

## Structure

| | |
|---|---|
| Modules | 182 (52 Shape, 45 Overlap, 39 Text, 24 Bitmap, 10 Stack, 7 FontIcon, 4 Komponent) |
| Max nesting | 7 levels |
| Formulas | 129 |
| Root globals | `theme`, `menu`, `navbar`, `transpar`, `wall.l`, `wall.d`, `pfp`, `name`, `text`, `text.2` |
| Assets | 41 bitmaps, `Segoe UI.ttf`, `Fluent Icons.ttf` + `.json` — **all 43 `kfile://` references resolve; nothing missing** |
| Declared features | LOCATION WEATHER FORECAST CALENDAR MUSIC SIGNAL NOTIFICATIONS NETWORK_INFO |

Three screens driven by the `menu` global (`D`esktop / `S`tart menu / `W`idgets),
switched by taps on the taskbar and animated with FORMULA move animations.

## Fixed

### 1. Turkish-locale global names (32 keys, 4 Komponents) — weather icon
The author's device was in Turkish locale, so Kustom derived global *keys* by
lowercasing the *titles* with Turkish rules — uppercase `I` became dotless `ı`
(U+0131). Every title containing an `I` is affected, and no others:

    title "Icon"   -> key "ıcon"     title "WINDY1" -> key "wındy1"
    title "ICONS"  -> key "ıcons"    title "HAIL1"  -> key "haıl1"
                                     title "RAIN1"  -> key "raın1"   (+ the 0/night twins)

The formulas that read them use plain ASCII:

    bitmap_bitmap = $gv(gv(icon)+gv(time))$    -> looks up "icon", stored as "ıcon"
    windy0 global = $gv(windy1)$               -> looks up "windy1", stored as "wındy1"

So the weather icon lookup and the windy/hail/rain night fallbacks hang off keys
that don't exist under that spelling. All 32 keys normalised to ASCII;
every literal `gv()` reference in the preset now resolves.

### 2. Malformed colour `#00000` — Start-menu divider
`root/1/2/2/1` ("Line"), formula enabled:

    $ce(if(gv(theme), #FFFFFF, #00000), alpha, 5)$     # 5 hex digits, light theme

Corrected to `#000000`.

### 3. Clock showed 12-hour digits on a 24-hour device
`root/5/2/1/2` ("Date"):

    $if(df(a)=" ", df(hh:mm), df(h:mm a))$

`hh` is clock-hour-of-halfday (1–12), so the *24-hour* branch rendered 15:30 as
`03:30`. Also `df(a)` returns an empty string rather than a space on some
devices, so the branch was often not taken at all. Now:

    $if(df(a)="" | df(a)=" ", df(HH:mm), df(h:mm a))$

### 4. `df(d/M/Y)` — wrong year over New Year
`Y` is week-year in Kustom's date patterns, which diverges from the calendar year
between roughly Dec 28 and Jan 4. Changed to `y`.

### 5. Komponents unlocked
The 4 weather-icon Komponents had `internal_locked: true`, which hides their
internals from the KLWP editor. Removed so the icon set can be adjusted on-device.

## Still device-specific (needs your phone's details)

### Aspect ratio
The layout is authored for **9:16** (`preset_info` 540x960; module coordinate
space 720x1280 — 660/610px-wide panels, 100px taskbar). The bundled wallpapers
are 1200x2400 (**9:18**), which already disagrees.

Kustom scales a preset by *width*, so on a tall modern screen the extra height
appears as slack. The panels are positioned with fixed offsets off the bottom
anchor:

    root/0 Start Menu Blur  position_offset_y = $-578+gv(navbar)$   shape 660x654
    root/1 Start Menu       position_offset_y = $-603+gv(navbar)$
    root/2 Widgets Blur     position_offset_y = $120+gv(navbar)$    shape 610x942
    root/3 Widgets          position_offset_y = $120+gv(navbar)$
    root/4 Taskbar Blur     shape_width = $si(rwidth)$   shape_height = $100+gv(navbar)$

Only the taskbar is screen-relative. On a 20:9 screen the 942-unit widgets panel
covers ~59% of the height instead of ~74%, leaving a gap at the top, and the
start menu sits lower than intended. The `navbar` global (currently `0`) is the
author's knob for gesture-nav vs. 3-button nav. Making the panel heights and
offsets derive from `si(rheight)` is the proper fix — but the numbers depend on
your resolution and navigation mode.

### Hardcoded app launches
All 14 taps use explicit `component=` intents captured in 2021. These break as
soon as the target app renames its launcher activity, and several almost
certainly have:

| Tap | Component | Note |
|---|---|---|
| Start menu "All apps" | `com.teslacoilsw.launcher/.NovaShortcutHandler` | **Nova Launcher required** |
| Taskbar Search | `com.teslacoilsw.launcher/.NovaShortcutHandler` | **Nova Launcher required** |
| Camera | `org.cyanogenmod.snap/…CameraLauncher` | LineageOS camera |
| File Explorer | `com.mixplorer/.activities.BrowseActivity` | MiXplorer |
| Reddit | `com.reddit.frontpage/launcher.default` | stale since 2021 |
| Instagram | `com.instagram.android/.activity.MainTabActivity` | stale |
| Discord | `com.discord/.app.AppActivity$Main` | stale |
| Mail | `com.google.android.gm/.ConversationListActivityGmail` | stale |
| Phone | `com.google.android.dialer/.extensions.GoogleDialtactsActivity` | stale |
| Twitter | `com.twitter.android/.StartActivity` | now X |
| YouTube / Photos / Spotify / WhatsApp | | likely still fine |

These can't be repaired from the file — the component has to be re-picked with
KLWP's app picker on the device that will run it.

### Runtime prerequisites (not file bugs)
* **Weather** (`wi()`, `wf()`, `li()`): Kustom's bundled free providers have
  largely lapsed since 2021. Settings -> Weather now generally needs your own
  provider/API key, or the widget shows blanks.
* **Calendar** (`ci()`): calendar permission + calendars selected in Kustom settings.
* **Notifications / music** (`ni()`, `mi()`): notification-listener access for KLWP.
* **`nc(csig)` / `nc(wsig)`**: signal strength is restricted on newer Android; the
  taskbar bars may sit at a fixed value.
* Three modules use `fx_bitmap_blur` (the two panel blurs and one more) — the
  usual suspect if the wallpaper feels heavy on battery.

## Cosmetic leftovers (not touched)
* `icons` global (title `ICONS`) is a LIST with empty `entries` — a dead, empty
  dropdown in the preset's settings screen.
* 18 modules carry empty formula strings, all with their formula toggle off
  (`0`), so the static value is used. Harmless editor residue.
* `preset_thumb_portrait.jpg` / `preset_thumb_landscape.jpg` are PNG data with a
  `.jpg` extension. Android decodes by content, so this is fine.
