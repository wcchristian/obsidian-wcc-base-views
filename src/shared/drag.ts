import { Platform, setIcon } from 'obsidian';

const activeDrags = new WeakMap<Document, PointerDrag>();

export interface DragPoint {
  x: number;
  y: number;
  startX: number;
  startY: number;
  pointerType: string;
}
interface DragOptions {
  owns?: (element: Element) => boolean;
  items: string;
  ignore?: string;
  preview?: boolean;
  onStart(item: HTMLElement, event: PointerEvent): boolean | void;
  onMove(item: HTMLElement, point: DragPoint): void;
  onDrop(item: HTMLElement, point: DragPoint): Promise<void>;
  onEnd(cancelled: boolean): void;
  onError(error: unknown): void;
}

export function dragGrip(parent: HTMLElement, label = 'Drag to move'): HTMLButtonElement {
  const grip = parent.createEl('button', {
    cls: 'wcc-drag-grip',
    attr: { type: 'button', 'aria-label': label, title: label },
  });
  setIcon(grip, 'grip-vertical');
  return grip;
}

/** Reorder against a stable neighbor ID, including hidden/filtered siblings. */
export function moveBefore(ids: string[], id: string, before: string | null): string[] {
  if (before === id) return [...ids];
  const result = ids.filter((value) => value !== id);
  const idx = before ? result.indexOf(before) : -1;
  result.splice(idx < 0 ? result.length : idx, 0, id);
  return result;
}

export function beforeAt(
  rows: HTMLElement[],
  y: number,
  exclude: string,
  idKey: string,
): HTMLElement | null {
  return (
    rows.find(
      (row) =>
        row.dataset[idKey] !== exclude &&
        y < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2,
    ) ?? null
  );
}

/** Fixed feedback does not shift cards while hit-testing their insertion position. */
export class DropIndicator {
  private line: HTMLElement;
  constructor(private root: HTMLElement) {
    this.line = root.ownerDocument.createElement('div');
    this.line.className = 'wcc-drop-feedback';
    this.line.hidden = true;
    this.line.setAttribute('role', 'img');
  }
  show(
    container: HTMLElement,
    before: HTMLElement | null,
    last: HTMLElement | null,
    text: string,
    vertical = false,
  ) {
    const rect = container.getBoundingClientRect();
    const win = this.root.ownerDocument.defaultView!;
    let left = Math.max(4, rect.left),
      right = Math.min(win.innerWidth - 4, rect.right);
    let top = Math.max(4, rect.top),
      bottom = Math.min(win.innerHeight - 4, rect.bottom);
    for (
      let parent = container.parentElement;
      parent && parent !== this.root.ownerDocument.body;
      parent = parent.parentElement
    ) {
      const style = win.getComputedStyle(parent),
        bounds = parent.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
        left = Math.max(left, bounds.left);
        right = Math.min(right, bounds.right);
      }
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
        top = Math.max(top, bounds.top);
        bottom = Math.min(bottom, bounds.bottom);
      }
    }
    if (right <= left || bottom <= top) {
      this.hide();
      return;
    }
    const anchor = before?.getBoundingClientRect() ?? last?.getBoundingClientRect();
    const position = vertical
      ? before
        ? anchor!.left
        : (anchor?.right ?? left + 8)
      : before
        ? anchor!.top
        : (anchor?.bottom ?? top + 8);
    this.line.classList.toggle('wcc-drop-feedback-vertical', vertical);
    this.line.style.left = `${vertical ? Math.max(left + 3, Math.min(right - 3, position)) : left + 3}px`;
    this.line.style.top = `${vertical ? top + 3 : Math.max(top + 3, Math.min(bottom - 3, position))}px`;
    this.line.style.width = vertical ? '4px' : `${Math.max(4, right - left - 6)}px`;
    this.line.style.height = vertical ? `${Math.max(4, bottom - top - 6)}px` : '4px';
    this.line.setAttribute('aria-label', text);
    if (!this.line.isConnected) this.root.ownerDocument.body.appendChild(this.line);
    this.line.hidden = false;
  }
  hide() {
    this.line.hidden = true;
  }
  destroy() {
    this.line.remove();
  }
}

/** Mouse/pen drag from card space; touch drag only from a grip so scrolling stays native. */
export class PointerDrag {
  private state: {
    item: HTMLElement;
    pointerId: number;
    point: DragPoint;
    started: boolean;
    down: PointerEvent;
  } | null = null;
  private ghost: HTMLElement | null = null;
  private frame = 0;
  private busy = false;
  private suppressUntil = 0;
  private cleanups: (() => void)[] = [];
  private doc: Document;
  private win: Window;
  private disposed = false;

  constructor(
    private root: HTMLElement,
    private options: DragOptions,
  ) {
    this.doc = root.ownerDocument;
    this.win = this.doc.defaultView!;
    const touch = this.win.matchMedia('(any-pointer: coarse)');
    const updateHandles = () =>
      root.classList.toggle('wcc-touch-drag', Platform.isMobile || touch.matches);
    updateHandles();
    this.listen(touch, 'change', updateHandles);
    this.listen(this.doc, 'pointerdown', this.down);
    this.listen(this.doc, 'pointermove', this.move, { passive: false });
    this.listen(this.doc, 'pointerup', this.up);
    this.listen(this.doc, 'pointercancel', this.cancelPointer);
    this.listen(root, 'lostpointercapture', this.cancelPointer);
    this.listen(this.win, 'blur', () => this.cancel());
    this.listen(this.doc, 'visibilitychange', () => {
      if (this.doc.hidden) this.cancel();
    });
    this.listen(this.doc, 'keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') this.cancel();
    });
    this.listen(this.doc, 'click', this.click, true);
    this.listen(this.doc, 'contextmenu', this.context, true);
    this.listen(
      root,
      'dragstart',
      (event) => {
        if ((event.target as Element).closest(options.items)) event.preventDefault();
      },
      true,
    );
  }

  private listen(
    target: EventTarget,
    type: string,
    handler: EventListener,
    options?: AddEventListenerOptions | boolean,
  ) {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  private owns(element: Element) {
    return this.root.contains(element) || !!this.options.owns?.(element);
  }

  private down = (raw: Event) => {
    const event = raw as PointerEvent;
    const active = activeDrags.get(this.doc);
    if (active && active !== this) return;
    if (this.state && event.pointerId !== this.state.pointerId) {
      this.cancel();
      return;
    }
    if (this.busy || this.state || !event.isPrimary || event.button !== 0) return;
    const target = event.target as Element;
    const item = target.closest<HTMLElement>(this.options.items);
    if (!item || !this.owns(item)) return;
    const grip = target.closest('.wcc-drag-grip');
    if (
      !grip &&
      (event.pointerType !== 'mouse' ||
        target.closest(
          this.options.ignore ?? 'a, button, input, textarea, select, [contenteditable="true"]',
        ))
    )
      return;
    if (item.querySelector('input:focus, textarea:focus, [contenteditable="true"]:focus')) return;
    activeDrags.set(this.doc, this);
    this.state = {
      item,
      pointerId: event.pointerId,
      started: false,
      down: event,
      point: {
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        pointerType: event.pointerType,
      },
    };
    if (grip) event.preventDefault();
    // Reserve touch grips immediately. Mouse clicks keep their original title/link target.
    if (grip) {
      try {
        this.root.setPointerCapture(event.pointerId);
      } catch {
        /* synthetic/test pointer */
      }
    }
  };

  private move = (raw: Event) => {
    const event = raw as PointerEvent;
    const state = this.state;
    if (!state || state.pointerId !== event.pointerId) return;
    state.point.x = event.clientX;
    state.point.y = event.clientY;
    if (!state.started) {
      if (Math.hypot(event.clientX - state.point.startX, event.clientY - state.point.startY) < 6)
        return;
      if (!state.item.isConnected || this.options.onStart(state.item, state.down) === false) {
        this.cancel();
        return;
      }
      state.started = true;
      this.win.getSelection()?.removeAllRanges();
      try {
        this.root.setPointerCapture(event.pointerId);
      } catch {
        /* synthetic/test pointer */
      }
      state.item.classList.add('wcc-drag-source');
      this.root.classList.add('wcc-drag-active');
      if (this.options.preview !== false) {
        const rect = state.item.getBoundingClientRect();
        this.ghost = state.item.cloneNode(true) as HTMLElement;
        this.ghost.classList.remove('wcc-drag-source');
        this.ghost.classList.add('wcc-drag-preview');
        this.ghost.setAttribute('aria-hidden', 'true');
        this.ghost.removeAttribute('id');
        this.ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
        this.ghost.style.width = `${Math.min(rect.width, 360)}px`;
        this.ghost.style.maxHeight = '180px';
        this.ghost.style.setProperty(
          '--wcc-item-padding',
          this.win.getComputedStyle(state.item).getPropertyValue('--wcc-item-padding'),
        );
        if (state.point.pointerType !== 'mouse') {
          // A compact preview of this card only; property lists can resemble extra cards.
          this.ghost
            .querySelectorAll(
              '.wcc-calendar-chip-props, .wcc-list-row-props, .wcc-kanban-card-props, .wcc-kanban-card-cover, .wcc-calendar-compact-event-range',
            )
            .forEach((el) => el.remove());
          this.ghost.style.width = `${Math.min(rect.width, 240, this.win.innerWidth - 24)}px`;
          this.ghost.style.maxHeight = '96px';
        }
        this.doc.body.appendChild(this.ghost);
      }
      this.frame = this.win.requestAnimationFrame(this.tick);
    }
    event.preventDefault();
    this.paint();
  };

  private paint() {
    const state = this.state;
    if (!state?.started) return;
    if (this.ghost) {
      const touch = state.point.pointerType !== 'mouse';
      const rect = this.ghost.getBoundingClientRect();
      this.ghost.style.left = `${touch ? Math.max(8, Math.min(this.win.innerWidth - rect.width - 8, state.point.x - rect.width / 2)) : state.point.x + 12}px`;
      this.ghost.style.top = `${touch ? Math.max(8, state.point.y - rect.height - 60) : state.point.y + 12}px`;
    }
    this.options.onMove(state.item, state.point);
  }

  private tick = () => {
    if (!this.state?.started) return;
    this.autoScroll(this.state.point);
    this.paint();
    this.frame = this.win.requestAnimationFrame(this.tick);
  };

  private autoScroll(point: DragPoint) {
    const hit = this.doc.elementFromPoint(point.x, point.y);
    if (!hit || !this.owns(hit)) return;
    let horizontal = false,
      vertical = false;
    for (
      let el: HTMLElement | null = hit as HTMLElement;
      el && el !== this.doc.body;
      el = el.parentElement
    ) {
      const style = this.win.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const speed = (position: number, start: number, end: number) =>
        position < start + 36
          ? -Math.min(14, (start + 36 - position) / 3)
          : position > end - 36
            ? Math.min(14, (position - end + 36) / 3)
            : 0;
      if (!horizontal && /auto|scroll/.test(style.overflowX) && el.scrollWidth > el.clientWidth) {
        const dx = speed(point.x, rect.left, rect.right);
        const old = el.scrollLeft;
        el.scrollLeft += dx;
        horizontal = el.scrollLeft !== old;
      }
      if (!vertical && /auto|scroll/.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
        const dy = speed(point.y, rect.top, rect.bottom);
        const old = el.scrollTop;
        el.scrollTop += dy;
        vertical = el.scrollTop !== old;
      }
    }
  }

  private up = (raw: Event) => {
    const event = raw as PointerEvent;
    const state = this.state;
    if (!state || state.pointerId !== event.pointerId) return;
    state.point.x = event.clientX;
    state.point.y = event.clientY;
    if (!state.started) {
      this.cleanup();
      return;
    }
    event.preventDefault();
    this.paint();
    this.busy = true;
    this.suppressUntil = Date.now() + 600;
    this.cleanup();
    void (async () => {
      try {
        await this.options.onDrop(state.item, state.point);
      } catch (error) {
        this.options.onError(error);
      } finally {
        this.busy = false;
        if (activeDrags.get(this.doc) === this) activeDrags.delete(this.doc);
        if (!this.disposed) this.options.onEnd(false);
      }
    })();
  };

  private cancelPointer = (raw: Event) => {
    if ((raw as PointerEvent).pointerId === this.state?.pointerId) this.cancel();
  };
  private click = (event: Event) => {
    if (!this.owns(event.target as Element)) return;
    if (Date.now() < this.suppressUntil || (event.target as Element).closest('.wcc-drag-grip')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  private context = (event: Event) => {
    if (!this.owns(event.target as Element)) return;
    if (this.state?.started || (event.target as Element).closest('.wcc-drag-grip')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  private cleanup() {
    const state = this.state;
    this.state = null;
    if (this.frame) this.win.cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.ghost?.remove();
    this.ghost = null;
    state?.item.classList.remove('wcc-drag-source');
    this.root.classList.remove('wcc-drag-active');
    if (!this.busy && activeDrags.get(this.doc) === this) activeDrags.delete(this.doc);
    if (state && this.root.hasPointerCapture(state.pointerId))
      this.root.releasePointerCapture(state.pointerId);
  }
  cancel() {
    const started = !!this.state?.started;
    if (started) this.suppressUntil = Date.now() + 600;
    this.cleanup();
    if (started && !this.disposed) this.options.onEnd(true);
  }
  destroy() {
    this.disposed = true;
    this.cancel();
    this.cleanups.splice(0).forEach((fn) => fn());
  }
}

/** Preserve the user's viewport through a data refresh after a saved or cancelled drop. */
export function rememberScroll(root: HTMLElement, selectors: string[]): () => void {
  const rootTop = root.scrollTop,
    rootLeft = root.scrollLeft;
  const positions = selectors.flatMap((selector) =>
    Array.from(root.querySelectorAll<HTMLElement>(selector)).map((element, index) => {
      const column = element.closest<HTMLElement>('[data-col-key]');
      return {
        selector,
        index,
        top: element.scrollTop,
        left: element.scrollLeft,
        column: column?.dataset.colKey,
        subgroup: column?.dataset.subgroupKey,
      };
    }),
  );
  return () => {
    root.scrollTop = rootTop;
    root.scrollLeft = rootLeft;
    for (const position of positions) {
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(position.selector));
      const element =
        position.column !== undefined
          ? candidates.find((candidate) => {
              const column = candidate.closest<HTMLElement>('[data-col-key]');
              return (
                column?.dataset.colKey === position.column &&
                column?.dataset.subgroupKey === position.subgroup
              );
            })
          : candidates[position.index];
      if (element) {
        element.scrollTop = position.top;
        element.scrollLeft = position.left;
      }
    }
  };
}
