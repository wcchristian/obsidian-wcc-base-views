import { renderStatus, statusProperty, statusType } from './status';
import { viewProperty } from './view-properties';
import type {
  App,
  BasesViewConfig,
  BasesView,
  TFile,
  HoverParent,
  BasesPropertyId,
  Value,
} from 'obsidian';
import {
  Keymap,
  parsePropertyId,
  BooleanValue,
  StringValue,
  NumberValue,
  DateValue,
  TagValue,
  NullValue,
  ListValue,
  Notice,
} from 'obsidian';
import type { PropWriteValue } from './frontmatter';
import { writeProp } from './frontmatter';
import { parseListEdit, propertyLinks } from './list-properties';
import { isCompact } from './view-density';

interface PropertyHost extends HoverParent, Pick<BasesView, 'data' | 'onDataUpdated'> {
  app: App;
  config: BasesViewConfig;
}

/** Shared property interactions keep all five views consistent. */
export class PropertyFieldRenderer {
  constructor(
    private host: PropertyHost,
    private prefix: 'wcc-list' | 'wcc-calendar' | 'wcc-kanban' | 'wcc-timeline' | 'wcc-table',
  ) {}
  private get app() {
    return this.host.app;
  }
  private get config() {
    return this.host.config;
  }

  render(
    parent: HTMLElement,
    val: Value,
    item: { file: TFile; entry?: import('obsidian').BasesEntry },
    pid: BasesPropertyId,
  ) {
    const statusPid = statusProperty(this.config);
    if (
      statusPid &&
      (pid === statusPid || pid === (viewProperty(this.config, 'doneProperty') ?? 'note.done'))
    ) {
      renderStatus(this.host, parent, item);
      return;
    }
    const editable = parsePropertyId(pid).type === 'note';
    const empty = val instanceof NullValue;
    const valueEl = parent.createDiv(`${this.prefix}-prop-value`);
    if (
      val instanceof BooleanValue &&
      statusType(this.config) === 'none' &&
      pid === (viewProperty(this.config, 'doneProperty') ?? 'note.done')
    ) {
      valueEl.createSpan({ text: val.isTruthy() ? 'true' : 'false' });
      return;
    }
    if (val instanceof BooleanValue && editable) {
      let checked = val.isTruthy();
      const toggle = valueEl.createEl('button', {
        cls: 'wcc-calendar-toggle' + (checked ? ' wcc-calendar-toggle-on' : ''),
        attr: {
          type: 'button',
          role: 'switch',
          'aria-checked': String(checked),
          'aria-label': this.config.getDisplayName(pid),
        },
      });
      toggle.createDiv('wcc-calendar-toggle-knob');
      toggle.onclick = async (e) => {
        e.stopPropagation();
        toggle.disabled = true;
        try {
          await writeProp(this.app, item.file, pid, !checked);
          checked = !checked;
          toggle.toggleClass('wcc-calendar-toggle-on', checked);
          toggle.setAttribute('aria-checked', String(checked));
        } catch (err) {
          console.error(err);
          new Notice('Failed to update property');
        } finally {
          toggle.disabled = false;
        }
      };
      return;
    }
    const render = (value: Value) => {
      valueEl.empty();
      if (value instanceof NullValue) {
        valueEl.createSpan({ cls: `${this.prefix}-prop-empty`, text: 'Empty' });
      } else if (value instanceof ListValue) {
        for (let i = 0; i < value.length(); i++) {
          if (i) valueEl.createSpan({ cls: `${this.prefix}-prop-separator`, text: ' · ' });
          this.renderText(valueEl, value.get(i).toString(), item);
        }
      } else {
        this.renderText(valueEl, value.toString(), item);
      }
    };
    render(val);
    const listValue = val instanceof ListValue ? val : null;
    const numberKind = val instanceof NumberValue;
    const dateKind = val instanceof DateValue;
    const supported =
      empty ||
      val instanceof StringValue ||
      val instanceof NumberValue ||
      val instanceof DateValue ||
      val instanceof TagValue ||
      (listValue &&
        Array.from({ length: listValue.length() }, (_, i) => listValue.get(i)).every(
          (v) => v instanceof StringValue || v instanceof TagValue,
        ));
    if (!editable || !supported) {
      parent.title = editable
        ? 'This value is read-only in this view'
        : 'File properties and formulas are read-only';
      return;
    }
    const begin = () => {
      if (parent.querySelector(`.${this.prefix}-prop-input`)) return;
      const currentList = val instanceof ListValue ? val : null;
      const isList = !!listValue;
      const isDate = dateKind;
      const raw = val instanceof NullValue ? '' : val.toString();
      const hasTime = isDate && raw.includes('T');
      const input = isList
        ? parent.createEl('textarea', {
            cls: `${this.prefix}-prop-input`,
            attr: { rows: '3', placeholder: 'One value per line' },
          })
        : parent.createEl('input', {
            cls: `${this.prefix}-prop-input`,
            type: numberKind ? 'number' : isDate ? (hasTime ? 'datetime-local' : 'date') : 'text',
          });
      input.setAttribute('aria-label', this.config.getDisplayName(pid));
      if (input instanceof HTMLInputElement && numberKind) input.step = 'any';
      input.value = isList
        ? currentList
          ? Array.from({ length: currentList.length() }, (_, i) =>
              currentList.get(i).toString(),
            ).join('\n')
          : ''
        : isDate
          ? raw.slice(0, hasTime ? 16 : 10)
          : raw;
      valueEl.hidden = true;
      input.focus();
      if (!isDate) input.select();
      let settled = false;
      const finish = () => {
        input.remove();
        valueEl.hidden = false;
      };
      const commit = async () => {
        if (settled) return;
        if (input instanceof HTMLInputElement && !input.checkValidity()) {
          input.reportValidity();
          input.focus();
          return;
        }
        let next: PropWriteValue = input.value.trim();
        if (isList) next = parseListEdit(input.value);
        else if (numberKind && next !== '') {
          next = Number(next);
          if (!Number.isFinite(next)) {
            new Notice('Enter a valid number');
            input.focus();
            return;
          }
        }
        settled = true;
        input.disabled = true;
        try {
          await writeProp(this.app, item.file, pid, next);
          val =
            next === '' || next === null
              ? new NullValue()
              : Array.isArray(next)
                ? new ListValue(next)
                : typeof next === 'number'
                  ? new NumberValue(next)
                  : isDate
                    ? (DateValue.parseFromString(next) ?? new StringValue(next))
                    : new StringValue(next);
          render(val);
          finish();
        } catch (err) {
          console.error(err);
          new Notice('Failed to save property. Your edit is still available; try again.');
          settled = false;
          input.disabled = false;
          input.focus();
        }
      };
      input.onblur = () => void commit();
      input.onkeydown = (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter' && (!isList || ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          void commit();
        }
        if (ev.key === 'Escape') {
          ev.preventDefault();
          settled = true;
          finish();
          valueEl.focus();
        }
      };
    };
    valueEl.onclick = (e) => {
      if ((e.target as HTMLElement).closest('a')) return;
      e.stopPropagation();
      begin();
    };
    valueEl.tabIndex = 0;
    valueEl.setAttribute('aria-label', `Edit ${this.config.getDisplayName(pid)}`);
    valueEl.onkeydown = (e) => {
      if (e.target !== valueEl || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      e.stopPropagation();
      begin();
    };
    valueEl.title =
      'Click to edit; Enter saves, Escape cancels. Lists use one value per line; Ctrl/Cmd+Enter saves.';
    valueEl.addClass(`${this.prefix}-prop-editable`);
  }

  renderText(parent: HTMLElement, raw: string, item: { file: TFile }) {
    const shortLinks =
      (this.prefix === 'wcc-list' || this.prefix === 'wcc-calendar') && isCompact(this.config);
    for (const part of propertyLinks(raw, shortLinks)) {
      if (!part.target) {
        parent.createSpan({ text: part.text });
        continue;
      }
      const link = parent.createEl('a', {
        cls: part.internal ? 'internal-link' : 'external-link',
        text: part.text,
        href: part.target,
      });
      link.draggable = false;
      link.title = part.target;
      if (part.internal) {
        link.dataset.href = part.target;
        link.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          void this.app.workspace.openLinkText(part.target!, item.file.path, Keymap.isModEvent(e));
        };
        link.onauxclick = (e) => {
          if (e.button !== 1) return;
          e.preventDefault();
          e.stopPropagation();
          void this.app.workspace.openLinkText(part.target!, item.file.path, 'tab');
        };
        link.onmouseover = (e) =>
          this.app.workspace.trigger('hover-link', {
            event: e,
            source: 'bases',
            hoverParent: this.host,
            targetEl: link,
            linktext: part.target,
            sourcePath: item.file.path,
          });
      } else {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.onclick = (e) => e.stopPropagation();
      }
    }
  }
}
