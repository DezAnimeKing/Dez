# Vendored fonts

Spectral and Jost, both under the SIL Open Font License 1.1 (`OFL-Spectral.txt`,
`OFL-Jost.txt`), served from this folder rather than from a CDN.

The Compendium has no network dependency — it must open and work offline, on a
phone, with nothing to fetch. A `fonts.googleapis.com` link would break that, so
the faces are checked in: latin and latin-ext subsets only, ~420 KB in total,
cached by the browser after the first load.

Declared in `css/fonts.css`. Weights match the theme's use of them: Spectral
200/300/400/600 with italic 300/400, Jost 200/300/400/500.

To update: refetch from Google Fonts with a modern browser user-agent, keep the
`latin` and `latin-ext` blocks, and mirror the `unicode-range` values into
`css/fonts.css`.
