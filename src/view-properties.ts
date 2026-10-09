import type { BasesPropertyId, BasesTextOption } from 'obsidian';

/** Property names need not exist in the vault before a view can use them. */
export function propertyId(raw: unknown): BasesPropertyId | null {
	if (typeof raw !== 'string' || !raw.trim()) return null;
	const name = raw.trim();
	if (/^(note|file|formula)\./.test(name)) {
		return name.slice(name.indexOf('.') + 1).trim() ? name as BasesPropertyId : null;
	}
	return `note.${name}`;
}

export function viewProperty(config: { get(key: string): unknown }, key: string): BasesPropertyId | null {
	return propertyId(config.get(key));
}

export function propertyOption(displayName: string, key: string): BasesTextOption {
	return { type: 'text', displayName, key, placeholder: 'Property name (existing or new)' };
}
