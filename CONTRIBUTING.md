# Contributing

## Make a change

1. Install dependencies with `npm ci`.
2. Find the owning module using [the architecture guide](docs/architecture.md).
3. Make the smallest change that solves the problem. Keep layout-specific behavior in its view; extract shared behavior when at least two views need it.
4. Add or update a lightweight behavior test for data transformations, writes, configuration, or error handling that changed.
5. Run `npm run format`, then `npm run check`.
6. Build and reload in a test vault. Check the affected interactions using the checklist below.

Use ordinary TypeScript functions and classes. Favor explicit names and readable control flow. Avoid speculative interfaces, generic frameworks, and abstractions that simply forward calls. Comments should explain constraints or intent. Keep runtime imports separate from type-only imports.

## Tests

Tests compile the actual source with esbuild and use Node's built-in test runner. Obsidian APIs are replaced by small adapters because the `obsidian` npm package provides types, not a host runtime. Use `tests/helpers.mjs` to load a module; test observable results rather than source text or incidental private structure.

Current coverage includes typed property edits and links across all five views, native note creation, color rules, configuration loading, view registration, date arithmetic across daylight saving, background settings, and ordering. Adapters cannot verify real Obsidian rendering, host event timing, or touch behavior.

The earlier browser fixtures are retained under `tests/browser/` as optional reference material. They are excluded from `npm test` and CI. No browser dependency is installed by the standard workflow.

## Manual regression checklist

Use sample notes in a disposable vault. For a rendering or interaction change, check the relevant cases:

- Open all five views; switch layouts and change visible properties, filters, grouping, and sort order.
- Create a note through native New and in-view Add. Check folder, template, inferred properties, and selected date/group values.
- Edit text, numbers, dates, checkboxes, and lists. Save with Enter/blur; cancel with Escape. Check that file/formula properties remain read-only and links open separately from editing.
- Drag notes within and between groups. Check saved ordering and properties, scroll position, and cancellation without writes.
- Move calendar ranges and move/resize timeline bars. Check inclusive end dates and behavior around daylight saving changes.
- Resize and reorder table columns; check keyboard controls and saved widths/order after reopening.
- Check backgrounds, colors, long titles, and empty results.
- On a phone or narrow touch pane, check scrolling, drag grips, compact calendar selection, and timeline details.
- Disable a view, reload, and verify the placeholder; re-enable it and confirm recovery.

## Repository hygiene

Keep the lockfile, source, tests, samples, and documentation tracked. Do not commit dependencies, generated builds, local settings, credentials, or test artifacts. CI runs the same `npm run check` command used locally. Pushing a semantic version tag matching the manifest runs the checked release workflow and publishes the three installable assets.
