const encoder = new TextEncoder();

export function utf8Bytes(s: string): number {
  return encoder.encode(s).byteLength;
}

export function codePointLength(s: string): number {
  return [...s].length;
}
