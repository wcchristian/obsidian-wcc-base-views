# View behavior

## Configuration

Every WCC view uses Setup, Appearance, and Advanced. The view’s ? button explains its settings. Irrelevant settings are hidden: status fields in Checkbox mode, task fields in None mode, image controls without an image, and options for inactive Calendar layouts or Timeline zoom levels.

Choose visible fields through Bases’ native Properties menu. Property settings accept existing or new names: `scheduled` means `note.scheduled`. Selecting a name does not write to notes. File and formula properties are read-only; writable note properties use Obsidian’s frontmatter writer.

## Task controls and appearance

Task control is Checkbox, Status, or None. Unset defaults to Checkbox, but no checkbox property is selected implicitly. Status pills work in all five views. They offer values from the Base’s notes and additional values configured for that view. There are no default statuses or automatic completed-status semantics. None hides task controls without changing stored data.

Keep empty statuses adds persistent groups when grouping by the selected status field. Calendar stays flat and calls this setting Extra status choices. Kanban also retains previously seen columns after their last task leaves. Add column creates an empty group without a placeholder note. Hide groups through their menus and restore them through Manage hidden groups.

List and Calendar offer Compact (3px spacing) and Comfortable (6px). Kanban and Timeline use 6px spacing. Custom padding is retired and saved values are ignored. Long titles wrap. Hide empty properties defaults on in List/Calendar; false and zero remain real values.

Color cards by and Color task controls by are independent. The latter reuses checkbox-color settings for both checkbox accents and status-pill text, border, and background. Custom rules use `value:color`; named colors use theme variables. Linked values accept short names such as `Work:orange`. File/formula values can be used to drive colors, but remain read-only. Background images and detailed rules are in Advanced.

List, Calendar, Kanban, and Timeline have details arrows. Individual choices survive refreshes while a view is open. List/Calendar start collapsed; Kanban/Timeline start expanded unless configured otherwise. List, Table, Timeline, and Kanban also have group-collapse arrows. Calendar does not repeat group headings in day cells.

## Editing, creation, and dragging

Click a title to open its note or a property to edit it. Enter or blur saves; Escape cancels; Ctrl/Cmd+Enter saves a list. Linked property values keep separate opening/editing actions. Numbers and booleans retain their types.

In-view Add uses Bases’ native New workflow, preserving its creation defaults. Calendar supplies the selected date/range. Grouped List/Table and Kanban supply writable group values.

A real reorder in List, Table, Kanban, or Calendar automatically selects `order` if no manual-order property is configured, then saves numeric ranks in steps of ten. If that name contains nonnumeric values in the Base, a suffixed name is selected. Existing manual-order mappings remain in use. No-op drops do not create a mapping. Moving between groups requires writable note properties.

On touch, hold a card before dragging; a quick swipe scrolls. Drag grips offer a direct target. Buttons, active text inputs, and property editors retain their own interactions. Drop feedback indicates the destination. Cancellation and failed-save cleanup are covered by the desktop/touch browser regression suite.

## Layout-specific behavior

Calendar supports Month, Week, and Agenda. Its toolbar selection is saved. Events stay flat, with task controls and optional details. Month limits/expansion, rolling Week, and Agenda day count have settings for their applicable layout. Narrow Month/Week panes use a date selector and selected-day event list; Agenda stays a list. Valid start dates are required.

Timeline supports Day, Week, and Month zoom, with a visible range for the selected zoom. Date ranges include the end day. Moving a bar changes dates and preserves calendar-day duration; its edges resize the range. These actions do not manually reorder rows. Narrow panes stack details above bars unless disabled in Advanced.

Kanban uses native grouping for columns and an optional swimlane property. Columns can be dragged, collapsed with arrows, hidden, and restored. Moving a card between a column and swimlane updates both group properties together. Covers and custom card titles are optional.

Table uses native Properties selection for its columns. Headers stay visible during scrolling. Drag headers to reorder, or use Alt+Left/Right on a focused header. Automatic widths follow content within theme limits; drag a divider to save a custom width, or double-click to return that column to automatic sizing. Row reordering and group movement use the shared task workflow. Native Table’s summaries and bulk cell-selection workflows are not duplicated.
