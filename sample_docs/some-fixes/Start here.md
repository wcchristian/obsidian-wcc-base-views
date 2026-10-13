# Some fixes

Open [[Some fixes.base]] and try Kanban, List, Table, Calendar, and Timeline.

These are demo statuses, not plugin defaults. The plugin starts with no predefined statuses. Each view is in **Completion → Status** mode, using the `status` property. Its **Show these statuses** list contains only `Waiting`, which starts empty. `Queued`, `Working`, and `Investigating` come from task notes and must appear even though they are not listed in settings.

- Click a status pill to change the task’s status. The existing `done: false` is preserved.
- In Kanban, use the **+** after the columns to create another empty status column. This adds a value to this view’s status settings; it creates no task note.
- Drag a card into Waiting to update its status.
- Collapse and expand groups with arrows in every view. List, Calendar, Kanban, and Timeline also have detail arrows.
- Change a view to **Completion → Checkbox**, set its **Done field (checkbox)** to `done`, and test the existing checkbox behavior. Status values stay intact.
- Settings are per view. To keep a new empty status visible in other views, add it to their **Show these statuses** lists as well.

The date examples begin on October 13, 2026. Calendar opens in Agenda mode for easy grouping checks. It still requires dated tasks; Timeline requires a start date.
