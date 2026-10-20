import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PAYLOAD_MAX_BYTES } from '@pb/shared/card-limits';
import { makeDeck } from '../../test/fixtures';
import { emptyPayload, type DraftPayloadByType } from '../draft';
import { payloadBytes } from '../validate';
import { CalcFields } from './CalcFields';

function renderCalc(payload: DraftPayloadByType['calc']) {
  render(
    <CalcFields
      payload={payload}
      onChange={vi.fn()}
      errors={{}}
      deck={makeDeck()}
      disabled={false}
    />,
  );
}

describe('CalcFields', () => {
  it('shows the live payload byte budget (FR-005)', () => {
    const payload = emptyPayload('calc') as DraftPayloadByType['calc'];
    renderCalc(payload);
    const used = payloadBytes({ type: 'calc', payload });
    expect(screen.getByText(`${used} / ${PAYLOAD_MAX_BYTES} bytes`)).toBeInTheDocument();
  });

  it('marks the meter over the budget', () => {
    const payload = emptyPayload('calc') as DraftPayloadByType['calc'];
    renderCalc({ ...payload, expression: 'a'.repeat(PAYLOAD_MAX_BYTES) });
    expect(screen.getByText(/ bytes$/)).toHaveClass('limit-meter--over');
  });
});
