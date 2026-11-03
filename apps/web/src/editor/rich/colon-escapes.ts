/**
 * remark-directive escapes every `:` followed by a letter or digit (`10\:30`). Only an ASCII letter
 * can start a directive name, so before anything else the escape is noise that would change a
 * body the writer never styled. An odd run of backslashes before the colon means the colon itself
 * is escaped; an even run is escaped backslashes and stays untouched.
 */
export function unescapeHarmlessColons(markdown: string): string {
  return markdown.replace(/(\\+):(?![A-Za-z])/g, (match, slashes: string) =>
    slashes.length % 2 === 1 ? `${slashes.slice(1)}:` : match,
  );
}
