/** Text script type: Hebrew, Greek, or Latin. */
export type TextScript = 'hebrew' | 'greek' | 'latin';

/** Determine the dominant script in text by counting letters per script. */
export function dominantScript(text: string): TextScript {
  let hebrewCount = 0;
  let greekCount = 0;
  let latinCount = 0;

  for (const char of text) {
    if (!/\p{L}/u.test(char)) {
      continue;
    }

    if (/\p{Script=Hebrew}/u.test(char)) {
      hebrewCount++;
    } else if (/\p{Script=Greek}/u.test(char)) {
      greekCount++;
    } else if (/\p{Script=Latin}/u.test(char)) {
      latinCount++;
    }
  }

  // Tie-breaking: hebrew > greek > latin
  if (hebrewCount > 0 && hebrewCount >= greekCount && hebrewCount >= latinCount) {
    return 'hebrew';
  }
  if (greekCount > 0 && greekCount >= latinCount) {
    return 'greek';
  }
  return 'latin';
}

/** Determine text direction based on dominant script. */
export function textDirection(text: string): 'rtl' | 'ltr' {
  return dominantScript(text) === 'hebrew' ? 'rtl' : 'ltr';
}

/** Get OpenGraph locale identifier for the text. */
export function ogLocale(text: string): 'he_IL' | 'el_GR' | 'en_US' {
  const script = dominantScript(text);
  switch (script) {
    case 'hebrew':
      return 'he_IL';
    case 'greek':
      return 'el_GR';
    case 'latin':
      return 'en_US';
  }
}

/** Get HTML lang attribute for the text. */
export function htmlLang(text: string): 'he' | 'el' | 'en' {
  const script = dominantScript(text);
  switch (script) {
    case 'hebrew':
      return 'he';
    case 'greek':
      return 'el';
    case 'latin':
      return 'en';
  }
}
