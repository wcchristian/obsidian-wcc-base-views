# WCC Base Views

Five views for Obsidian Bases: **WCC - Table**, **WCC - List**, **WCC - Kanban**, **WCC - Calendar**, and **WCC - Timeline**. Notes remain ordinary Markdown files with properties. Requires Obsidian 1.10.2 or later.

This is a pre-1.0 plugin. The package/repository name is `obsidian-wcc-base-views`; the installed plugin ID and folder are `wcc-base-views`.

## Development

Use Node.js 18 or later and npm:

```sh
npm ci
npm run check
npm run watch
```

`check` runs type checking, lint, formatting checks, lightweight Node tests, and the production build. It does not require Obsidian, Playwright, or a browser download.

Install this checkout in a test vault as `.obsidian/plugins/wcc-base-views`, or symlink it there. Enable **WCC Base Views** in Community plugins. After building, reload the plugin or restart Obsidian. Keep experiments in a test vault because property editing writes to notes.

| Command                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Build once with a source map             |
| `npm run watch`        | Rebuild after source changes             |
| `npm run build`        | Create the production `main.js`          |
| `npm run typecheck`    | Check strict types and unused code       |
| `npm run lint`         | Check source rules                       |
| `npm run format`       | Apply consistent formatting              |
| `npm run format:check` | Check formatting without modifying files |
| `npm test`             | Run lightweight behavior tests           |
| `npm run check`        | Run all standard checks and build        |

## Using the views

Create or open a Base, then choose a WCC view from its layout menu. Use the native Bases Properties, Filter, Sort, and Group menus to select notes and visible fields. View settings configure the layout and writable properties.

- **Table:** editable property columns, column resizing and reordering, and grouped rows.
- **List:** flat or grouped task rows with completion and property editing.
- **Kanban:** property-based columns, optional swimlanes, cover images, and inline card creation.
- **Calendar:** month, week, and agenda layouts with date-based note creation and rescheduling.
- **Timeline:** inclusive date ranges with movable and resizable bars.

[View behavior and configuration](docs/views.md) describes editing, creation, ordering, and mobile layouts. Copy `sample_docs/` into a test vault for example notes and Bases.

## Working on the code

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the edit/test workflow and [the architecture guide](docs/architecture.md) for module responsibilities. There is no code generation or AI-specific development requirement.

`main.js`, source maps, `node_modules`, and vault-local `data.json` are ignored by Git. Release installations need `manifest.json`, the built `main.js`, and `styles.css`. Keep `package-lock.json` tracked for reproducible installs.

## Pre-1.0 rename

The plugin ID changed from `obsidian-base-views` to `wcc-base-views`. Move the old installation folder to the new name, including `data.json` if you want to keep saved settings. In `.obsidian/community-plugins.json`, replace the old plugin ID.

Existing Bases need these view type changes:

| Previous type        | New type       |
| -------------------- | -------------- |
| `base-ca-table-view` | `wcc-table`    |
| `base-list-view`     | `wcc-list`     |
| `base-kanban-view`   | `wcc-kanban`   |
| `base-calendar-view` | `wcc-calendar` |
| `base-timeline-view` | `wcc-timeline` |

This development vault and repository samples have been updated. Custom CSS selectors now use the `wcc-` prefix. Quick Add and custom new-note folder overrides are retired; creation uses native Bases defaults. Retired capture profile data is preserved for recovery.
