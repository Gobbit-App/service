import type { ReactElement, ReactNode } from 'react';
import type { Components } from 'react-markdown';
import { TextDetectionContext, type TextDetection } from '../../cards/text-detection';
import { Detected, isDetectKind } from './Detected';
import { DETECT_ATTR, VALUE_ATTR, remarkDetect } from './remark-detect';
import { segmentText } from './segment';

/** Renders the plugin's marked spans as controls; any other span stays a span. */
const span: Components['span'] = ({ node: _node, children, ...props }) => {
  const record = props as Record<string, unknown>;
  const kind = record[DETECT_ATTR];
  const value = record[VALUE_ATTR];
  if (isDetectKind(kind) && typeof value === 'string') {
    return (
      <Detected kind={kind} value={value}>
        {children}
      </Detected>
    );
  }
  return <span {...props}>{children}</span>;
};

/** Plain text (a table cell) with the same marking as a card body. */
export function renderDetectedText(text: string): ReactNode {
  const segments = segmentText(text);
  if (!segments.some((segment) => segment.kind !== 'text')) return text;
  return segments.map((segment, index) =>
    segment.kind === 'text' ? (
      segment.text
    ) : (
      <Detected key={index} kind={segment.kind} value={segment.value}>
        {segment.text}
      </Detected>
    ),
  );
}

const DETECTION: TextDetection = {
  remarkPlugins: [remarkDetect],
  components: { span },
  renderText: renderDetectedText,
};

/** D340: cards inside get tappable emails, phones, web addresses and numbers (Browse only). */
export function DetectionProvider({ children }: { children: ReactNode }): ReactElement {
  return (
    <TextDetectionContext.Provider value={DETECTION}>{children}</TextDetectionContext.Provider>
  );
}
