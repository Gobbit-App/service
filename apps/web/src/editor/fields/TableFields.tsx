import type { ReactElement } from 'react';
import { PAYLOAD_MAX_BYTES, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS } from '@pb/shared/card-limits';
import { Button } from '../../ui/buttons/Button';
import { IconButton } from '../../ui/buttons/IconButton';
import { payloadBytes } from '../validate';
import { LimitMeter } from './LimitMeter';
import {
  addColumn,
  addRow,
  canAddColumn,
  canAddRow,
  canRemoveColumn,
  moveColumn,
  moveRow,
  removeColumn,
  removeRow,
  setCell,
  setHeading,
} from './table-ops';
import type { FieldsProps } from './types';

/** US3: grid editor within 12 rows × 6 columns and the 8192-byte payload budget (lazy). */
export function TableFields({
  payload,
  onChange,
  errors,
  disabled,
}: FieldsProps<'table'>): ReactElement {
  const { columns, rows } = payload;
  const headingName = (c: number) => columns[c] || `Column ${c + 1}`;
  const listErrors = [errors['payload.columns'], errors['payload.rows']].filter(Boolean);

  return (
    <div className="editor__fields">
      <div className="table-fields">
        <table>
          <thead>
            <tr>
              {columns.map((heading, c) => {
                const error = errors[`payload.columns.${c}`];
                const errorId = `table-heading-error-${c}`;
                return (
                  <th key={c} scope="col">
                    <input
                      aria-label={`Column ${c + 1} heading`}
                      value={heading}
                      dir="auto"
                      disabled={disabled}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                      onChange={(e) => onChange(setHeading(payload, c, e.currentTarget.value))}
                    />
                    <div className="table-fields__tools">
                      <IconButton
                        icon="arrow-left"
                        label={`Move column ${c + 1} left`}
                        disabled={disabled || c === 0}
                        onClick={() => onChange(moveColumn(payload, c, -1))}
                      />
                      <IconButton
                        icon="arrow-right"
                        label={`Move column ${c + 1} right`}
                        disabled={disabled || c === columns.length - 1}
                        onClick={() => onChange(moveColumn(payload, c, 1))}
                      />
                      <IconButton
                        icon="close"
                        label={`Remove column ${c + 1}`}
                        disabled={disabled || !canRemoveColumn(payload)}
                        onClick={() => onChange(removeColumn(payload, c))}
                      />
                    </div>
                    {error && (
                      <p id={errorId} className="field__error">
                        {error}
                      </p>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>
                    <input
                      aria-label={`Row ${r + 1}, ${headingName(c)}`}
                      value={cell}
                      dir="auto"
                      disabled={disabled}
                      onChange={(e) => onChange(setCell(payload, r, c, e.currentTarget.value))}
                    />
                  </td>
                ))}
                <td>
                  <div className="table-fields__tools">
                    <IconButton
                      icon="arrow-up"
                      label={`Move row ${r + 1} up`}
                      disabled={disabled || r === 0}
                      onClick={() => onChange(moveRow(payload, r, -1))}
                    />
                    <IconButton
                      icon="arrow-down"
                      label={`Move row ${r + 1} down`}
                      disabled={disabled || r === rows.length - 1}
                      onClick={() => onChange(moveRow(payload, r, 1))}
                    />
                    <IconButton
                      icon="close"
                      label={`Remove row ${r + 1}`}
                      disabled={disabled}
                      onClick={() => onChange(removeRow(payload, r))}
                    />
                  </div>
                  {errors[`payload.rows.${r}`] && (
                    <p className="field__error">{errors[`payload.rows.${r}`]}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-fields__tools">
        <Button
          icon="plus"
          label="Add row"
          variant="ghost"
          disabled={disabled || !canAddRow(payload)}
          onClick={() => onChange(addRow(payload))}
        />
        <Button
          icon="plus"
          label="Add column"
          variant="ghost"
          disabled={disabled || !canAddColumn(payload)}
          onClick={() => onChange(addColumn(payload))}
        />
      </div>
      <p className="muted">
        {rows.length} / {TABLE_MAX_ROWS} rows · {columns.length} / {TABLE_MAX_COLUMNS} columns ·{' '}
        <LimitMeter
          used={payloadBytes({ type: 'table', payload })}
          max={PAYLOAD_MAX_BYTES}
          unit="bytes"
        />
      </p>
      {listErrors.map((message) => (
        <p key={message} className="field__error">
          {message}
        </p>
      ))}
    </div>
  );
}
