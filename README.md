# Base Views

An Obsidian plugin that adds four custom views to [Obsidian Bases](https://help.obsidian.md/bases):

- **Kanban** — columns from any grouped property, drag-and-drop cards, inline card creation, cover images, sub-group swimlanes
- **Calendar** — month / week / agenda modes with draggable events
- **Timeline** — Gantt-style bars with drag-to-move, drag-to-resize, and editable properties
- **List** — flat or grouped list with inline property editing
- **Table** — native-style rows and columns with inline editing, sticky headers, and resizable columns

Requires Obsidian **1.10.2+** (the Bases API).

## Testing locally (easiest way)

1. **Install and build:**

   ```sh
   npm install
   npm run watch   # rebuilds main.js on every source change
   ```

2. **Symlink the repo into a test vault.** Obsidian only reads `manifest.json`, `main.js`, and `styles.css`, so symlinking the whole repo works fine:

   ```sh
   ln -s /path/to/obsidian-base-views /path/to/TestVault/.obsidian/plugins/obsidian-base-views
   ```

3. In the test vault: **Settings → Community plugins** → turn off Restricted mode → enable **Base Views**.

4. **(Recommended) Install the [Hot Reload](https://github.com/pjeby/hot-reload) plugin** in the test vault and create an empty `.hotreload` file in this repo's root:

   ```sh
   touch .hotreload
   ```

   With `npm run watch` running, every save now rebuilds `main.js` and Hot Reload reloads the plugin instantly — no Obsidian restart needed. Without Hot Reload, toggle the plugin off/on (or run the "Reload app without saving" command) after each build.

5. **Sample data:** copy the `sample_docs/` folder into the vault. Each subfolder (`kanban`, `calendar`, `timeline`, `list`) contains a ready-made `.base` file plus test notes, so you can open a base and switch to the matching view immediately.

## Build for release

```sh
npm run build   # minified production build of main.js
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | One-shot development build (with sourcemap) |
| `npm run watch` | Development build that rebuilds on file changes |
| `npm run build` | Minified production build |


## Local CA refinements

Long note titles wrap in all five views, including calendar multi-day bars and timeline labels. Timeline rows and calendar lanes grow to fit. Items use a tighter 6 px padding by default; each Bases view has its own **Spacing → Item padding (px)** slider (0–20 px). Touch drag grips keep their larger targets at every padding setting.

View names use the CA prefix. All five CA view types offer independent Checkbox color settings: select a property and add value:color rules. The checkbox outline and checked fill use that color; clearing the property restores the normal theme appearance. Primary card colors are configured separately under Color, including in Kanban. Explicit card colors take precedence over the column's card-border option. Link aliases do not change their assigned color, and automatic card colors remain consistent across views.

For linked properties, use a short note name such as `Datasite:#619de6` or `[[Datasite]]:#619de6`; both match `[[CA Notes/Projects/Datasite|Work]]`. Short link names match without regard to capitalization. They match the whole note name, so `Datasite` does not also color `Datasite Archive`. Existing full-path rules still work and take precedence over short names, regardless of rule order. This applies to views with card and checkbox color settings; plain property values keep exact matching.

Run `node tests/colors.test.mjs` for link normalization, color rules, list values, and independent checkbox/card color checks. Rebuild with `node esbuild.config.mjs prod`. Native Obsidian interaction testing remains necessary.

Property settings accept existing or new names, such as `completed`, `taskOrder`, or `scheduled`. Plain names refer to note properties; existing `note.*`, `file.*`, and `formula.*` selections remain supported. Configuring a name does not change notes. Using a writable function creates the missing frontmatter property with the appropriate value (for example, a checkbox writes a boolean and drag sorting writes numeric ranks). File and formula properties remain read-only.

## Shared interaction rules

Calendar, List, Kanban, and Timeline share these controls:

- **Properties:** click a value or space beside a link to edit; click links to open them. Empty note properties are editable, file/formula properties are read-only, and numbers/checkboxes/lists retain their types. Enter or blur saves, Escape cancels, and Ctrl/Cmd+Enter saves lists. Completion buttons and editable fields work with the keyboard.
- **Titles and spacing:** long titles wrap, a title click opens its note, and desktop users can drag from titles or blank card space. Each view has the same 6 px default and independent Item padding setting. Timeline shows visible properties in its left-hand row; rows grow while multiline editors are open.
- **Dragging:** mobile uses dedicated grips; desktop move grips are hidden. Only one drag/save runs at a time, with a text-free drop line and destination highlight. Native scrolling, cancellation, and saved scroll position are preserved. Timeline edge handles resize dates.
- **Creation:** in-view adds use Bases' New workflow and inferred folder/filter/template defaults, with the selected date/group/column added. Folder selection follows the native Bases New button.
- **Defaults and dates:** calendar mode and timeline zoom defaults apply on opening or when changed in settings; temporary toolbar selections survive updates. Calendar-day navigation, date moves, resize bounds, and timeline columns remain aligned across daylight-saving changes.

The views retain their own layout settings (calendar day counts, Kanban columns/swimlanes, and timeline zoom/ranges). `node tests/list.test.mjs` verifies the shared editor in all five views; `node tests/create-view.test.mjs` verifies creation; `node tests/drag.browser.test.mjs` exercises actual rendered fields, completion, title clicks/drags, startup ordering, defaults, and desktop/emulated-mobile gestures.

## CA - list interactions

Tasks have padded, bordered rows with space between them. Visible note properties can be edited by clicking a non-link value or the space beside a link, including empty values. Enter or blur saves; Escape cancels. Numbers stay numeric, checkboxes toggle directly, and list properties use one value per line (Ctrl/Cmd+Enter saves). File properties and formulas are read-only. Wiki links, URLs, and Markdown web links open their targets; click the field space beside a link to edit it. Clicking the title opens the note. Fields can also be focused with Tab and edited with Enter or Space.

**Sort order property** selects a numeric note property such as `order`. Lower values appear first within each group, with missing or invalid values last. Dragging within a group writes ranks `0, 10, 20…` to all notes in that group. Leave it unset to use Bases sorting. Moving between groups updates the grouping property. Run `node tests/list.test.mjs` to check list links, typed edits, save/cancel behavior, and read-only properties.

## CA - calendar refinements

All in-view add actions use Obsidian Bases' native New workflow, so they use the same inferred filter properties, template defaults, and folder selection as the main New button. Calendar adds also set the selected date/range; list group adds and Kanban column/swimlane adds set their selected note properties without clearing other defaults. Numeric, checkbox, and list group values keep their types. Custom New notes settings have been removed from all views; previously saved folder overrides are ignored. The separate Quick Add dialog, ribbon button, command, and profile settings have been removed. Previously saved profile data is retained in plugin settings for recovery. Run `node tests/create-view.test.mjs` for creation behavior checks.

In the calendar view settings, **Display → Default view** chooses Month, Week, or Agenda independently for each Bases view. The calendar opens in that mode. The header buttons switch modes temporarily and keep that selection through note updates; reopening the calendar restores the configured default. Changing the default in settings applies immediately.

Month, week, agenda, and overflow event cards have more padding, rounded borders, and space between events. Calendar and list share the same property editor: click a plain value or field space beside a link to edit, click a link to open its target, and click the event title to open the note. Empty note properties are visible and editable. Numbers remain numeric, lists use one value per line, and file properties/formulas are read-only. Enter or blur saves; Escape cancels; Ctrl/Cmd+Enter saves lists. Multi-day bars retain their compact layout.

`node tests/list.test.mjs` runs the property interaction checks for all five CA views.

## Dragging on desktop and mobile

All four CA views use a shared pointer controller. Drag from the dotted grip on touch devices; no long press is needed. Swiping elsewhere scrolls normally. Grips suppress long-press context menus while the rest of the card keeps its context menu. Desktop move grips are hidden: drag from non-interactive card space or a column header. Timeline edge controls remain available for resizing. Links, checkboxes, and property fields keep their normal actions.

Drops show a prominent line with endpoints and a highlighted date/column. Feedback sits above a compact single-card touch preview, stays visible while scrolling, and does not shift cards during hit-testing. Only one drag can run across views, including while its drop is saving. Drops preserve viewport position through refreshes and save before rebuilding the view. Escape, pointer cancellation, a second touch, dropping outside the pane, and closing the view cancel an active drag without writing. Calendar overflow cards and multi-day segments can be moved. Calendar and timeline moves preserve calendar-day duration across DST; timeline resize clamps the range to at least one inclusive day. Kanban moves to collapsed columns preserve the existing cards and can update a column and swimlane in one frontmatter transaction.

List manual reordering still requires a numeric note Sort order property. Moving between groups requires writable note properties; file properties and formulas cannot be changed by dragging.

Verification: `node tests/list.test.mjs`, `node tests/colors.test.mjs`, and `node_modules/.bin/tsc --noEmit`. `node tests/drag.browser.test.mjs` additionally requires Playwright and its Chromium runtime. It runs real mouse and emulated mobile-touch gestures against the actual view handlers with a mocked Obsidian file API, including saved values, cancellation, context-menu suppression, scrolling, overflow, and failures. Set `CA_PLAYWRIGHT_MODULE` to a bundled Playwright path when it is not installed locally. Physical iOS/Android Obsidian testing is still required.

## Compact calendar on phones

On touch devices with a calendar pane up to 700 px wide, Month shows a compact date grid with event counts and a full-width selected-day list below it. Week shows a date strip and the same selected-day list; longer configured weeks scroll horizontally. Tap a date to switch days. Full note titles, editable properties, linked properties, multi-day ranges, and an Add note button are available in the list. Drag a card's grip onto a date to reschedule it; the destination day becomes selected after the move. Multi-day events are counted on every day they span.

Wider panes and desktop mouse layouts keep the existing month/week grids. The compact layout responds to pane size changes and preserves the selected day through data refreshes. Agenda keeps its existing layout. Desktop month expansion and event limits apply to the full grid; the compact selected-day list shows every event for that day. Browser checks cover both layouts, empty days, counts, editable-property visibility, month drag targets, and week navigation.

Timeline keeps titles and properties above the scrolling event layer. Drag the divider at the title column’s right edge to resize it on desktop or touch; the width is saved per view. Focus the divider and use Left/Right arrows (Shift for larger steps), or Home to restore 200 px. The same width is adjustable under Spacing → Title column width (px).

## CA - Table

Table uses Bases’ native Properties selection, column order, filters, sorting, and grouping. The custom **Table config** group is removed; column selection comes from the native Properties menu. The view settings’ **Properties** panel contains only **Sort order property**, which saves numeric ranks when rows are dragged. Spacing, colors, checkbox colors, and background image settings remain available. Adds use native Bases folder/template defaults and the selected group.

Cells retain inline editing and clickable links; file/formula properties are read-only. Columns resize and drag from their headers (with grips on touch). Any property can go before file name, and widths follow their properties. Order is saved through the native Properties configuration. Alt+Left/Right moves a focused header. Table remains available through its plugin enable/disable toggle.

## Timeline on mobile

On touch panes up to 700 px wide, Timeline stacks full-width note details above each timeline lane. Titles wrap, properties remain editable, and completion stays beside the title. The common date axis scrolls horizontally while note details stay readable. Bars and grips are larger; move and resize gestures keep the shared single-item drag behavior.

Start/End date fields allow direct editing without a drag or context menu. Clearing End makes the item a single day; moving Start past End adjusts the existing end date so the range remains valid. **Show range** scrolls to that note’s bar. The initial mobile position focuses a current/upcoming item, or the most recent past item when none are upcoming.

Wide panes retain the desktop sidebar layout, including its saved width. The view responds to pane resizing and rotation. Under **Mobile**, turn off **Stack details above timeline on small screens** to use the desktop layout on a phone too. Zoom, navigation, filters, property colors, adds, and other view settings remain shared.

Table columns reorder by dragging their headers on desktop or their header grips on touch devices. A vertical insertion line marks the destination. All selected columns, including file name, move together with their cells and retain their saved widths. Order is saved through Bases’ native Properties configuration. Alt+Left/Right moves a focused header with the keyboard; resize dividers remain separate.
