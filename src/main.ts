import { Plugin } from 'obsidian';
import type { BaseViewsSettings } from './config/settings';
import { migrateSettings } from './config/settings';
import { BaseViewsSettingTab } from './config/settings-tab';
import { VIEW_DEFINITIONS } from './config/view-registry';
import { DisabledView } from './shared/disabled-view';

/** Owns plugin lifecycle and persistence; rendering belongs to the views. */
export default class BaseViewsPlugin extends Plugin {
  settings: BaseViewsSettings = migrateSettings({});

  async onload(): Promise<void> {
    await this.loadSettings();
    for (const view of VIEW_DEFINITIONS) {
      this.registerBasesView(view.id, {
        name: view.name,
        icon: view.icon,
        factory: (controller, container) =>
          this.settings[view.setting]
            ? view.create(controller, container, this)
            : new DisabledView(controller, container, view.id, view.name),
        options: view.options,
      });
    }
    this.addSettingTab(new BaseViewsSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = migrateSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
