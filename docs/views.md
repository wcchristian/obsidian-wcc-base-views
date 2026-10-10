# View behavior

## Properties and creation

Choose visible fields through Bases' native Properties menu. A setting accepts an existing or new property name: `scheduled` means `note.scheduled`; explicit `note.*`, `file.*`, and `formula.*` selections are supported. Selecting a name does not write to notes. An interaction that changes a writable property uses Obsidian's frontmatter writer.

Click a value or the space beside a link to edit. Links open their targets; titles open their notes. Enter or blur saves, Escape cancels, and Ctrl/Cmd+Enter saves a list. Lists use one value per line so commas in values are preserved. Numbers and booleans retain their types. File and formula properties are read-only.

Every in-view Add delegates to native Bases New, keeping folder, template, and filter defaults. Calendar adds set the selected date/range. Grouped List/Table adds and Kanban column/swimlane adds supply their selected property values. There is no separate capture profile system or folder override.

## Appearance

Each view has an item-padding slider (6 px default, 0–20 px). Long titles wrap. Card colors and checkbox colors have independent property selectors and `value:color` rules. A short linked name such as `Project:blue` matches `[[Projects/Project|Alias]]`; exact path rules take precedence. Named colors use theme variables. Automatic colors remain consistent across views.

List and Calendar also have a per-view **Density** setting: Compact (default) or Comfortable. Compact uses 3 px padding when no explicit padding is saved, smaller gaps, dim project-colored card backgrounds with solid left-edge accents, and wrapping metadata instead of a separate labeled row per property. Linked metadata shows short note names while preserving aliases, targets, and editing values. Comfortable retains labeled property rows. **Hide empty properties** defaults on in both layouts; disable it to expose blank fields for inline editing. False and zero still appear.

Compact Agenda omits repeated event dates and uses one small heading per day. List, Agenda, and Calendar cards show checkbox and title; a keyboard-accessible expand button reveals selected properties. Titles retain native hover previews and open the full note. Details can be expanded at any pane width, and touch controls keep larger targets.

Backgrounds accept a vault attachment path or URL, with fit, opacity, and blur. Shared settings use identical defaults; Table uses the same appearance controls as List.

## Ordering and dragging

Choose a numeric note Sort order property for persistent manual ordering. Lower values appear first; invalid or missing ranks appear last. List row reordering writes ranks in steps of ten. Without a configured rank, Bases sorting remains authoritative. Moving between groups requires writable note properties.

Drag from anywhere on a card, including its title, checkbox, or displayed metadata. A click still opens, toggles, or edits; a move of at least 6 px becomes a drag and suppresses the click. Active text inputs remain editing surfaces. On touch, hold a card for 250 ms before dragging; a quick swipe scrolls normally, and grips still start immediately. Column and table controls retain their specific drag targets. A drop line marks the destination without moving layout content during hit testing. Escape, pointer cancellation, a second touch, leaving the pane, or closing the view cancels without a write. Timeline edge handles resize ranges.

## Calendar and Timeline

Calendar supports Month, Week, and Agenda. Configured defaults apply on opening or when changed; temporary toolbar selections survive data updates. Month event limits and expansion apply to the full grid. Rolling Week starts from the current date.

On panes up to 700 px wide, including desktop panes with a mouse, Month and Week show a compact date selector and a selected-day list with expandable properties and an Add button. Resizing across the breakpoint updates the layout automatically. Multi-day events are counted on every day they span. Agenda retains its list layout. Touch targets and drag grips still depend on the input device.

Timeline has day/week/month zoom and configurable visible ranges. Date ranges include their end day. Moves preserve calendar-day duration; resizing keeps at least one day. A resizable title column holds properties, and panes up to 700 px wide place details above the event layer on desktop as well as mobile. The per-view stacked-layout setting can disable this behavior.

## Kanban and Table

Kanban uses Bases grouping for columns and supports a separate subgroup property for swimlanes. Column order, visibility, collapsed state, and empty-column display are configurable. Inline draft cards survive refreshes. Moving between a column and swimlane updates both properties together.

Table uses the native Properties selection for all columns, including completion. Headers remain visible while scrolling. Drag headers to reorder; Alt+Left/Right moves a focused header. Resize column dividers by dragging or using arrow keys; Shift uses larger increments. Width and order are saved per view.

List, Agenda, and Calendar cards have a details arrow whenever visible properties are available, at every pane width and in both density modes. **Expand details by default** is a per-view appearance setting, off by default. Individual choices survive data refreshes for the lifetime of the view; changing the default resets those choices. Clicking the arrow toggles details, and dragging from it still moves the card. Project tints and priority checkbox colors remain visible when collapsed.
