import type { App, SettingDefinitionItem } from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';
import type BaseViewsPlugin from '../main';
import { VIEW_DEFINITIONS } from './view-registry';

export class BaseViewsSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: BaseViewsPlugin,
  ) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: 'View availability',
        desc: 'Reload after changing view toggles. Disabled views display a placeholder.',
        searchable: false,
        render: (setting) => {
          setting.setHeading();
        },
      },
      ...VIEW_DEFINITIONS.map((view) => ({
        name: view.name,
        desc: view.description,
        control: { type: 'toggle' as const, key: view.setting },
      })),
    ];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName('View availability').setHeading();
    containerEl.createEl('p', {
      text: 'Reload Obsidian after changing view toggles. Disabled views display a placeholder.',
      cls: 'setting-item-description',
    });
    for (const view of VIEW_DEFINITIONS) {
      new Setting(containerEl)
        .setName(view.name)
        .setDesc(view.description)
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings[view.setting]);
          toggle.onChange(async (value) => {
            this.plugin.settings[view.setting] = value;
            await this.plugin.saveSettings();
          });
        });
    }
  }
}
