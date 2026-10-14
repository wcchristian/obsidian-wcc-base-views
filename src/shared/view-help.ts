import type { App } from 'obsidian';
import { Modal } from 'obsidian';

type Kind = 'calendar' | 'kanban' | 'timeline' | 'list' | 'table';
const labels: Record<Kind, string> = {
  calendar: 'Calendar',
  kanban: 'Kanban',
  timeline: 'Timeline',
  list: 'List',
  table: 'Table',
};
/** Native view settings have no custom help controls, so help sits beside the view. */
export function viewHelp(app: App, parent: HTMLElement, kind: Kind) {
  const button = parent.createEl('button', {
    cls: 'wcc-view-help',
    text: '?',
    attr: { type: 'button', title: 'View settings help', 'aria-label': 'View settings help' },
  });
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    new ViewHelpModal(app, kind).open();
  };
}
class ViewHelpModal extends Modal {
  constructor(
    app: App,
    private kind: Kind,
  ) {
    super(app);
  }
  onOpen() {
    this.titleEl.setText(`${labels[this.kind]} settings`);
    const content = this.contentEl;
    content.empty();
    content.createEl('h3', { text: 'Setup' });
    content.createEl('p', {
      text: 'Choose checkbox mode to mark tasks done, status mode to choose a status, or none to hide task controls. Unset task control defaults to checkbox. Property names can be existing or new; selecting a name does not change your notes.',
    });
    content.createEl('p', {
      text:
        this.kind === 'kanban'
          ? 'Status mode shows a clickable pill on each card. Change its status through the pill or drag it between status columns. Group by your status property using the Bases Group menu.'
          : 'Status pills offer values found in your notes plus values you add in settings. No status automatically counts as completed.',
    });
    content.createEl('p', {
      text:
        this.kind === 'calendar'
          ? 'Extra status choices makes values available in the pill menu even without tasks. Calendar cards remain flat, without status group headings.'
          : 'Keep empty statuses adds values that stay available without tasks. Other values found in notes still appear. Group by your status property to display empty groups.',
    });
    if (this.kind === 'calendar' || this.kind === 'timeline')
      content.createEl('p', {
        text: 'Choose a date property so notes can appear. End date is optional and creates a range. Notes without a valid start date do not appear.',
      });
    content.createEl('h3', { text: 'Appearance' });
    content.createEl('p', {
      text:
        this.kind === 'table'
          ? 'Choose visible columns in the Bases Properties menu. Drag headers to reorder columns and drag their edges to resize them.'
          : this.kind === 'list' || this.kind === 'calendar'
            ? 'Compact spacing keeps cards small; Comfortable gives them more room. Details arrows reveal selected properties. Choose visible properties in the Bases Properties menu.'
            : 'Details arrows reveal selected properties. Choose visible properties in the Bases Properties menu.',
    });
    content.createEl('p', {
      text: 'Color cards by uses the values of a property to choose a color. Custom color rules live in advanced settings.',
    });
    content.createEl('h3', { text: 'Advanced' });
    content.createEl('p', {
      text: 'Manual order property should be a number property, such as rank. Dragging writes numbers to this property to save the task order.',
    });
    content.createEl('p', {
      text: 'Custom color rules use value:color, for example high:red or low:#8b5cf6. Task control colors apply to both checkboxes and status pills. Choose the coloring property in advanced settings.',
    });
    content.createEl('p', {
      text: 'Custom padding controls the space inside cards. Background image accepts a vault path or image URL; fit, blur, and opacity appear after you choose an image.',
    });
    if (this.kind === 'kanban')
      content.createEl('p', {
        text: 'Drag column headers to reorder them, use arrows to collapse them, and use the column menu to hide them. Manage hidden groups restores hidden columns or swimlanes. Add column creates an empty column without creating a note.',
      });
    const close = content.createEl('button', { text: 'Close', attr: { type: 'button' } });
    close.onclick = () => this.close();
  }
}
