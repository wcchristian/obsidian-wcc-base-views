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
