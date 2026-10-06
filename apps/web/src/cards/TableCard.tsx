import type { ReactElement } from 'react';
import type { TablePayload } from './payload-guards';

/** Renders a scrollable table card. */
export function TableCard({ payload }: { payload: TablePayload }): ReactElement {
  const { columns, rows } = payload;

  return (
    <div className="table-card" role="region" aria-label="Table" tabIndex={0}>
      <table className="table-card__table">
        <thead>
          <tr>
            {columns.map((column, i) => (
              <th key={`h-${i}-${column}`} scope="col" dir="auto">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`r-${i}`}>
              {row.map((cell, j) => {
                if (j === 0) {
                  return (
                    <th key={`c-${i}-${j}-${cell}`} scope="row" dir="auto">
                      {cell}
                    </th>
                  );
                }
                return (
                  <td key={`c-${i}-${j}-${cell}`} dir="auto">
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="card-muted">No rows</p>}
    </div>
  );
}
