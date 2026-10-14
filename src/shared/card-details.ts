import { setIcon } from 'obsidian';
type Config = { get(key: string): unknown };

/** Each view remembers manual choices across refreshes until its default changes. */
export class CardDetails {
  private states = new Map<string, boolean>();
  private defaultExpanded = false;

  render(
    titleRow: HTMLElement,
    card: HTMLElement,
    props: HTMLElement,
    title: string,
    id: string,
    prefix: string,
    config: Config,
  ): void {
    const setting = config.get('detailsExpanded');
    const defaultExpanded =
      setting === true ||
      (setting == null && (prefix === 'wcc-kanban' || prefix === 'wcc-timeline'));
    if (defaultExpanded !== this.defaultExpanded) {
      this.states.clear();
      this.defaultExpanded = defaultExpanded;
    }
    if (!props.children.length) return;
    let expanded = this.states.get(id) ?? defaultExpanded;
    const button = titleRow.createEl('button', {
      cls: `wcc-card-details ${prefix}-details`,
      attr: { type: 'button' },
    });
    const update = () => {
      props.hidden = !expanded;
      card.toggleClass('wcc-details-expanded', expanded);
      button.setAttribute('aria-expanded', String(expanded));
      button.setAttribute('aria-label', `${expanded ? 'Hide' : 'Show'} details for ${title}`);
      setIcon(button, expanded ? 'chevron-down' : 'chevron-right');
    };
    update();
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      expanded = !expanded;
      this.states.set(id, expanded);
      update();
    };
  }
}
