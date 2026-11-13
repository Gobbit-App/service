/** jsdom has no ClipboardEvent or DataTransfer: dispatches a cancelable paste with a stub clipboard. */
export function paste(target: EventTarget, files: File[], text = ''): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { files, getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
  target.dispatchEvent(event);
  return event;
}
