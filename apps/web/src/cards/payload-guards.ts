/** Link payload with optional preview metadata. */
export type LinkPayload = {
  url: string;
  preview?: { title?: string; description?: string; image?: string };
};

/** Image payload with public ID and alt text. */
export type ImagePayload = { publicId: string; alt: string };

/** Table payload with columns and rows. */
export type TablePayload = { columns: string[]; rows: string[][] };

/** Single calculator field. */
export type CalcField = {
  key: string;
  label: string;
  unit?: string;
  default?: number;
};

/** Calculator payload with fields and expression. */
export type CalcPayload = {
  fields: CalcField[];
  expression: string;
  resultLabel: string;
};

/**
 * Type guard to check if a value is a record object.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Narrows unknown payload into LinkPayload or null.
 */
export function asLinkPayload(p: unknown): LinkPayload | null {
  if (!isRecord(p)) return null;
  if (typeof p.url !== 'string') return null;

  const result: LinkPayload = { url: p.url };

  if (isRecord(p.preview)) {
    const preview: LinkPayload['preview'] = {};
    if (typeof p.preview.title === 'string') preview.title = p.preview.title;
    if (typeof p.preview.description === 'string') {
      preview.description = p.preview.description;
    }
    if (typeof p.preview.image === 'string') preview.image = p.preview.image;

    if (Object.keys(preview).length > 0) {
      result.preview = preview;
    }
  }

  return result;
}

/**
 * Narrows unknown payload into ImagePayload or null.
 */
export function asImagePayload(p: unknown): ImagePayload | null {
  if (!isRecord(p)) return null;
  if (typeof p.publicId !== 'string' || p.publicId === '') return null;
  if (typeof p.alt !== 'string') return null;

  return { publicId: p.publicId, alt: p.alt };
}

/**
 * Narrows unknown payload into TablePayload or null.
 */
export function asTablePayload(p: unknown): TablePayload | null {
  if (!isRecord(p)) return null;

  if (!Array.isArray(p.columns)) return null;
  if (p.columns.length === 0) return null;
  if (!p.columns.every((col) => typeof col === 'string')) return null;

  const columnCount = p.columns.length;

  if (!Array.isArray(p.rows)) return null;
  for (const row of p.rows) {
    if (!Array.isArray(row) || !row.every((cell) => typeof cell === 'string')) {
      return null;
    }
  }

  const rows = p.rows.map((row) => {
    const adjustedRow = [...row];
    if (adjustedRow.length < columnCount) {
      adjustedRow.push(...Array(columnCount - adjustedRow.length).fill(''));
    } else if (adjustedRow.length > columnCount) {
      adjustedRow.length = columnCount;
    }
    return adjustedRow;
  });

  return { columns: p.columns, rows };
}

/**
 * Narrows unknown payload into CalcPayload or null.
 */
export function asCalcPayload(p: unknown): CalcPayload | null {
  if (!isRecord(p)) return null;

  if (typeof p.expression !== 'string') return null;
  if (typeof p.resultLabel !== 'string') return null;

  if (!Array.isArray(p.fields) || p.fields.length === 0) return null;

  const fields: CalcField[] = [];

  for (const field of p.fields) {
    if (!isRecord(field)) return null;
    if (typeof field.key !== 'string') return null;
    if (typeof field.label !== 'string') return null;

    const calcField: CalcField = { key: field.key, label: field.label };

    if (field.unit !== undefined) {
      if (typeof field.unit !== 'string') return null;
      calcField.unit = field.unit;
    }

    if (field.default !== undefined) {
      if (typeof field.default !== 'number' || !Number.isFinite(field.default)) return null;
      calcField.default = field.default;
    }

    fields.push(calcField);
  }

  return { fields, expression: p.expression, resultLabel: p.resultLabel };
}
