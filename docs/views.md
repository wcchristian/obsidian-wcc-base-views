# View behavior

## Properties and creation

Choose visible fields through Bases' native Properties menu. A setting accepts an existing or new property name: `scheduled` means `note.scheduled`; explicit `note.*`, `file.*`, and `formula.*` selections are supported. Selecting a name does not write to notes. An interaction that changes a writable property uses Obsidian's frontmatter writer.

Click a value or the space beside a link to edit. Links open their targets; titles open their notes. Enter or blur saves, Escape cancels, and Ctrl/Cmd+Enter saves a list. Lists use one value per line so commas in values are preserved. Numbers and booleans retain their types. File and formula properties are read-only.

Every in-view Add delegates to native Bases New, keeping folder, template, and filter defaults. Calendar adds set the selected date/range. Grouped List/Table adds and Kanban column/swimlane adds supply their selected property values. There is no separate capture profile system or folder override.

## Appearance

Each view has an item-padding slider (6 px default, 0–20 px). Long titles wrap. Card colors and checkbox colors have independent property selectors and `value:color` rules. A short linked name such as `Project:blue` matches `[[Projects/Project|Alias]]`; exact path rules take precedence. Named colors use theme variables. Automatic colors remain consistent across views.

Backgrounds accept a vault attachment path or URL, with fit, opacity, and blur. Shared settings use identical defaults; Table uses the same appearance controls as List.

## Ordering and dragging

Choose a numeric note Sort order property for persistent manual ordering. Lower values appear first; invalid or missing ranks appear last. List row reordering writes ranks in steps of ten. Without a configured rank, Bases sorting remains authoritative. Moving between groups requires writable note properties.

On desktop, drag from non-interactive card space or a column header. Touch layouts provide grips; swiping elsewhere scrolls. A drop line marks the destination without moving layout content during hit testing. Escape, pointer cancellation, a second touch, leaving the pane, or closing the view cancels without a write. Timeline edge handles resize ranges.

## Calendar and Timeline

Calendar supports Month, Week, and Agenda. Configured defaults apply on opening or when changed; temporary toolbar selections survive data updates. Month event limits and expansion apply to the full grid. Rolling Week starts from the current date.

On narrow touch panes, Month and Week show a compact date selector and a selected-day list with full properties and an Add button. Multi-day events are counted on every day they span. Agenda retains its list layout.

Timeline has day/week/month zoom and configurable visible ranges. Date ranges include their end day. Moves preserve calendar-day duration; resizing keeps at least one day. A resizable title column holds properties, and compact layouts place details above the event layer.

## Kanban and Table

Kanban uses Bases grouping for columns and supports a separate subgroup property for swimlanes. Column order, visibility, collapsed state, and empty-column display are configurable. Inline draft cards survive refreshes. Moving between a column and swimlane updates both properties together.

Table uses the native Properties selection for all columns, including completion. Headers remain visible while scrolling. Drag headers to reorder; Alt+Left/Right moves a focused header. Resize column dividers by dragging or using arrow keys; Shift uses larger increments. Width and order are saved per view.
