import { BasesView, BasesPropertyId, BooleanValue, NumberValue, ListValue, NullValue, Value, Notice, parsePropertyId } from 'obsidian';

function propertyValue(value: Value): unknown {
	if (value instanceof NullValue) return null;
	if (value instanceof BooleanValue) return value.isTruthy();
	if (value instanceof NumberValue) return Number(value.toString());
	if (value instanceof ListValue) return Array.from({ length: value.length() }, (_, i) => propertyValue(value.get(i)));
	return value.toString();
}

/** Preserve the actual type of a column/group value instead of its display text. */
export function groupDefaults(view: BasesView, pid: BasesPropertyId | null, key: string): Record<string, unknown> {
	if (!pid || parsePropertyId(pid).type !== 'note') return {};
	const { name } = parsePropertyId(pid);
	if (key === '(no value)') return { [name]: null };
	for (const group of view.data.groupedData ?? []) {
		for (const entry of group.entries) {
			const value = entry.getValue(pid);
			if (value && value.toString() === key) return { [name]: propertyValue(value) };
		}
	}
	return { [name]: key };
}

/** Use Bases' own New workflow so folder, template, and inferred filters stay in sync. */
export async function createViewNote(view: BasesView, title?: string, properties: Record<string, unknown> = {}): Promise<void> {
	try {
		await view.createFileForView(title, (fm: Record<string, unknown>) => {
			Object.assign(fm, properties);
		});
	} catch (error) {
		console.error(error);
		new Notice('Failed to create note from this Bases view.');
	}
}
