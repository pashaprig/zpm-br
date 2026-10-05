# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

This is a static, framework-free HTML/CSS/JS app with no build step, package manager, linter, or test suite.

- Open [index.html](index.html) directly in a browser (double-click, or `Start-Process index.html` on Windows) to run it. No dev server is required.
- To verify a change, reopen `index.html` in the browser and exercise the UI manually — there is no automated test runner.

## Architecture

Single-page app, currently a text-comparison tool skeleton (UI/styling done, comparison logic not yet implemented):

- [index.html](index.html) — markup only, single BEM block `.compare` (e.g. `.compare__panel`, `.compare__textarea`). Two `<textarea>` inputs (`#textInputA`, `#textInputB`), a `#compareButton`, and a results area (`#diffResult` / `#diffList`) positioned *above* the inputs, meant to be populated with `<li class="compare__result-item compare__result-item--added|--removed">` entries once diff logic is added.
- [styles.css](styles.css) — all design tokens (colors, spacing, radii, font sizes) are CSS custom properties on `:root`; the light theme is a full override of the same variable names under `body[data-theme="light"]`, so components must only ever reference the variables, never hardcode colors. `--color-diff-added-*` / `--color-diff-removed-*` are already defined for the future diff rendering. This variable set and naming convention is shared verbatim with the sibling `csv_project` app on the Desktop — keep new variables consistent with that system rather than inventing a parallel one.
- [scripts/theme.js](scripts/theme.js) — self-contained IIFE exposing `initThemeToggle(checkboxEl)`; persists the dark/light choice to `localStorage` under `zpm-theme` and toggles `data-theme` on `<body>`.
- [scripts/scripts.js](scripts/scripts.js) — bootstrap, loaded last; currently only wires up the theme toggle. Comparison logic (reading `#textInputA`/`#textInputB`, computing a diff, rendering into `#diffList`) is intentionally not implemented yet and will be specified separately.

Script load order in `index.html` matters: `theme.js` must load before `scripts.js` since the latter calls `initThemeToggle`.
