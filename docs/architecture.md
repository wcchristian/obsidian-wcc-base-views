# Architecture

## Responsibilities

| Location                                           | Responsibility                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `src/main.ts`                                      | Plugin lifecycle, registration, and settings persistence             |
| `src/config/view-registry.ts`                      | View identifiers, display names, factories, and toggle descriptions  |
| `src/config/view-options.ts`                       | Per-view settings and shared appearance defaults                     |
| `src/config/settings.ts`                           | Validate persisted settings and create independent collections       |
| `src/config/settings-tab.ts`                       | Render plugin settings from the registry                             |
| `src/views/<kind>/view.ts`                         | Render and interact with one Bases layout                            |
| `src/views/<kind>/model.ts`                        | That layout's note and geometry types                                |
| `src/shared/property-field.ts`                     | Typed property editors and linked-property rendering                 |
| `src/shared/frontmatter.ts`                        | Write properties through Obsidian's YAML API                         |
| `src/shared/view-create.ts`                        | Native Bases creation with typed context defaults                    |
| `src/shared/drag.ts`                               | Pointer lifecycle, drop feedback, scroll restoration, and reordering |
| `src/shared/drag-dates.ts`                         | Local calendar date formatting and arithmetic                        |
| `src/shared/date-prompt.ts`                        | Shared date-selection dialog                                         |
| `src/shared/background.ts`                         | Resolve vault images and apply background defaults                   |
| `src/shared/color-rules.ts`, `task-appearance.ts`  | Resolve property colors and style completion controls                |
| `src/shared/list-properties.ts`                    | Parse editable lists, links, and numeric ranks                       |
| `src/shared/view-properties.ts`, `view-spacing.ts` | Normalize property selections and item spacing                       |
| `styles.css`                                       | View presentation, responsive layouts, and interaction feedback      |

## Data flow

Obsidian supplies a query controller, configuration, and matching entries to a view. On data updates, the view reads the configuration and renders those entries. Shared editors write note properties through `processFrontMatter`; Bases then refreshes its query. Creation delegates to `createFileForView` so the native folder, filters, and template defaults remain authoritative.

The plugin owns persistence; views receive the plugin where legacy manual ordering needs it. Views import the plugin only as a type. Shared modules do not import plugin startup or the registry. Table extends List to reuse grouping, row ordering, note creation, and row drag behavior while providing its own columns and cells.

## Constraints to preserve

- Calendar arithmetic uses local date components. A calendar day may span 23 or 25 hours; do not move dates by multiplying milliseconds.
- Only note properties are writable. File and formula values remain read-only.
- A group's displayed text is not necessarily its stored type. Preserve booleans, numbers, and lists when creating notes from groups.
- Link clicks and field editing are separate actions. Property text does not render arbitrary HTML.
- One pointer drag owns a document at a time, including asynchronous save. Cancellation must clean up without writing.
- Save before rebuilding after a drop, restore scroll, and release observers/listeners when unloading.
- Option factories return independent configuration objects. View IDs must match each view's `type`.

## Adding a view

Create its renderer under `src/views/`, add its options and registry entry, and add its enable setting to `ViewSettingKey` and settings loading. Use a `wcc-` view ID and CSS namespace. Test registration, configuration defaults, and any new data behavior. Avoid a second creation or property-editing system.
