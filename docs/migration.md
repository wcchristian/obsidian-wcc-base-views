# Upgrading an early installation

The plugin ID changed from `obsidian-base-views` to `wcc-base-views`. Move the old installation folder to the new name, including `data.json` if you want to keep saved settings. In `.obsidian/community-plugins.json`, replace the old plugin ID.

Existing Bases need these view type changes:

| Previous type        | New type       |
| -------------------- | -------------- |
| `base-ca-table-view` | `wcc-table`    |
| `base-list-view`     | `wcc-list`     |
| `base-kanban-view`   | `wcc-kanban`   |
| `base-calendar-view` | `wcc-calendar` |
| `base-timeline-view` | `wcc-timeline` |

Custom CSS selectors now use the `wcc-` prefix. Quick Add and custom new-note folder overrides are retired; creation uses native Bases defaults. Retired capture profile data is preserved for recovery.

## Status controls and simpler settings

Existing `wcc-*` views keep their type IDs and saved property mappings. The new `status_type` setting defaults to checkbox mode. A view without a configured `doneProperty` continues to have no completion checkbox. Choose `status_type: none` to hide task checkboxes and status pills without changing stored task properties. Status mode is opt-in; it writes the selected status property only when you change a pill or move a card. It never synchronizes or clears the done property.

Setup, Appearance, and Advanced reorganize the menus without renaming existing configuration keys. Saved colors, images, dates, property mappings, column order, and hidden/collapsed state are retained. Custom padding is retired and ignored; density now selects 3px or 6px spacing. A task reorder without a manual-order mapping now selects an order property and writes numeric ranks, using a suffixed name if the default contains text values. Hidden Kanban groups can be restored through Manage hidden groups.

There are presentation and interaction changes: Calendar renders events without group headings, Kanban keeps previously seen columns when their last task leaves, and Calendar layout/Timeline zoom buttons now save their selection. These can change the appearance and saved view configuration of an existing Base. Loading a view does not rewrite task-note frontmatter; direct edits, checkbox/status clicks, and drags still write their corresponding properties.
