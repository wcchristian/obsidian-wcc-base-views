/** Missing or invalid manual ranks belong at the end, preserving Bases order. */
export function numericOrder(raw?: string): number {
  if (!raw?.trim()) return Infinity;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Infinity;
}

/** One value per line preserves commas in tags and link aliases. */
export function parseListEdit(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export interface PropertyLinkPart {
  text: string;
  target?: string;
  internal?: boolean;
}

/** Recognize property links without rendering arbitrary HTML. */
export function propertyLinks(raw: string): PropertyLinkPart[] {
  const pattern =
    /\[\[([^\]\n]+)\]\]|\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|(?:https?:\/\/|mailto:)[^\s<>[\]]+/gi;
  const parts: PropertyLinkPart[] = [];
  let offset = 0;
  for (const match of raw.matchAll(pattern)) {
    const start = match.index!;
    if (start > offset) parts.push({ text: raw.slice(offset, start) });
    if (match[1]) {
      const [target, ...alias] = match[1].split('|');
      parts.push({ text: alias.join('|') || target, target: target.trim(), internal: true });
    } else if (match[3]) {
      parts.push({ text: match[2], target: match[3], internal: false });
    } else {
      const target = match[0].replace(/[.,;!?]+$/, '');
      parts.push({ text: target, target, internal: false });
      if (target.length < match[0].length) parts.push({ text: match[0].slice(target.length) });
    }
    offset = start + match[0].length;
  }
  if (offset < raw.length) parts.push({ text: raw.slice(offset) });
  return parts;
}
