import { App, PluginSettingTab, Setting } from 'obsidian';
import BaseViewsPlugin from './main';
export interface BaseViewsSettings {
  enableCalendar: boolean;
  enableKanban: boolean;
  enableTimeline: boolean;
  enableList: boolean;
  enableTable: boolean;
  localOrder: Record<string, string[]>;
  /** Retained for recovery of profiles from older versions; no longer used. */
  quickAddProfiles?: unknown[];
}

export const DEFAULT_SETTINGS: BaseViewsSettings = {
  enableCalendar: true,
  enableKanban: true,
  enableTimeline: true,
  enableList: true,
  enableTable: true,
  localOrder: {},
};

export function migrateSettings(raw: any): BaseViewsSettings {
  const out: BaseViewsSettings = {
    enableCalendar: raw?.enableCalendar !== false,
    enableKanban: raw?.enableKanban !== false,
    enableTimeline: raw?.enableTimeline !== false,
    enableList: raw?.enableList !== false,
    enableTable: raw?.enableTable !== false,
    localOrder: raw?.localOrder ?? {},
  };

  // Preserve retired profile data without keeping its creation or settings UI.
  if (Array.isArray(raw?.quickAddProfiles)) out.quickAddProfiles = raw.quickAddProfiles;

  return out;
}

export class BaseViewsSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: BaseViewsPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Base Views Settings' });

    // ── View toggles ───────────────────────────────────────────
    containerEl.createEl('h3', { text: 'Views' });
    containerEl.createEl('p', {
      text: 'Enable or disable individual views. Reload Obsidian after changing these toggles for the changes to take effect. Disabled views will show a placeholder message when opened.',
      cls: 'setting-item-description'
    });

    new Setting(containerEl)
      .setName('Calendar view')
      .setDesc('Show month, week, and agenda calendar layouts for date-based notes.')
      .addToggle(toggle => {
        toggle.setValue(this.plugin.settings.enableCalendar);
        toggle.onChange(async (value) => {
          this.plugin.settings.enableCalendar = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Kanban view')
      .setDesc('Show notes as cards in a Kanban board grouped by a property.')
      .addToggle(toggle => {
        toggle.setValue(this.plugin.settings.enableKanban);
        toggle.onChange(async (value) => {
          this.plugin.settings.enableKanban = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Timeline view')
      .setDesc('Show notes as bars on a scrollable Gantt-chart timeline.')
      .addToggle(toggle => {
        toggle.setValue(this.plugin.settings.enableTimeline);
        toggle.onChange(async (value) => {
          this.plugin.settings.enableTimeline = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('List view')
      .setDesc('Show notes as a flat or grouped list with color, properties, and sorting.')
      .addToggle(toggle => {
        toggle.setValue(this.plugin.settings.enableList);
        toggle.onChange(async (value) => {
          this.plugin.settings.enableList = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Table view')
      .setDesc('Show notes in a table with editable properties, resizable columns, and grouped rows.')
      .addToggle(toggle => {
        toggle.setValue(this.plugin.settings.enableTable);
        toggle.onChange(async value => {
          this.plugin.settings.enableTable = value;
          await this.plugin.saveSettings();
        });
      });

  }
}
