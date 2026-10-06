import Markdown, { type Components } from 'react-markdown';
import type { ReactElement } from 'react';

const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  p: ({ node: _node, ...props }) => <p {...props} dir="auto" />,
  li: ({ node: _node, ...props }) => <li {...props} dir="auto" />,
  h1: ({ node: _node, ...props }) => <h1 {...props} dir="auto" />,
  h2: ({ node: _node, ...props }) => <h2 {...props} dir="auto" />,
  h3: ({ node: _node, ...props }) => <h3 {...props} dir="auto" />,
  h4: ({ node: _node, ...props }) => <h4 {...props} dir="auto" />,
  h5: ({ node: _node, ...props }) => <h5 {...props} dir="auto" />,
  h6: ({ node: _node, ...props }) => <h6 {...props} dir="auto" />,
  blockquote: ({ node: _node, ...props }) => <blockquote {...props} dir="auto" />,
};

/** Renders markdown body content with security and text direction support. */
export function TextCard({
  body,
  skipHtml = true,
}: {
  body: string;
  skipHtml?: boolean;
}): ReactElement {
  return (
    <div className="text-card">
      <Markdown skipHtml={skipHtml} components={components}>
        {body}
      </Markdown>
    </div>
  );
}
