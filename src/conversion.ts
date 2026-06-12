export const DIATONIC_TO_ABC: Record<string, string> = {
  '+1': 'C',
  '-1': 'D',
  '+2': 'E',
  '-2': 'F',
  '+3': 'G',
  '-3': 'A',
  '+4': 'c',
  '-4': 'd',
  '+5': 'e',
  '-5': 'f',
  '+6': 'g',
  '-6': 'a',
  '+7': 'b',
  '-7': "c'",
  '+8': "d'",
  '-8': "e'",
  '+9': "f'",
  '-9': "g'",
  '+10': "a'"
};

export const CHROMATIC_TO_ABC: Record<string, string> = {
  '+1': 'C',
  '-1': '^B',
  '+2': '^C',
  '-2': 'D',
  '+3': '^D',
  '-3': 'E',
  '+4': 'F',
  '-4': '^F',
  '+5': 'G',
  '-5': '^G',
  '+6': 'A',
  '-6': '^A',
  '+7': 'B',
  '-7': 'c',
  '+8': '^c',
  '-8': 'd',
  '+9': '^d',
  '-9': 'e',
  '+10': 'f',
  '-10': '^f',
  '+11': 'g',
  '-11': '^g'
};

export const ABC_TO_CHROMATIC: Record<string, string> = {
  C: '+1',
  '^B': '-1',
  '^C': '+2',
  _D: '+2',
  D: '-2',
  '^D': '+3',
  _E: '+3',
  E: '-3',
  F: '+4',
  '^F': '-4',
  _G: '-4',
  G: '+5',
  '^G': '-5',
  _A: '-5',
  A: '+6',
  '^A': '-6',
  _B: '-6',
  B: '+7',
  c: '-7',
  '^c': '+8',
  _d: '+8',
  d: '-8',
  '^d': '+9',
  _e: '+9',
  e: '-9',
  f: '+10',
  '^f': '-10',
  _g: '-10',
  g: '+11',
  '^g': '-11',
  _a: '-11'
};

const tokenPattern = /(^|[\s([{;,])([+-]?)(10|[1-9])(:[/\d]+)?('{1,3}|"{1,3}|<)?(?=$|[\s)\]};,.!?])/g;
const abcNotePattern = /(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)(\d*\/?\d*)/g;

function normalizeDuration(duration: string | undefined): string {
  return duration ? duration.slice(1) : '';
}

function isAfterColon(prefix: string, offset: number, source: string): boolean {
  let index = offset + prefix.length - 1;

  while (index >= 0 && /\s/.test(source[index])) {
    index -= 1;
  }

  return source[index] === ':';
}

export function formatHarpTabs(input: string): string {
  let formatted = '';
  let index = 0;
  let previousWasToken = false;

  while (index < input.length) {
    const tokenEnd = canStartHarpTab(input, index, previousWasToken) ? readHarpTabToken(input, index) : null;

    if (tokenEnd !== null) {
      if (previousWasToken) {
        formatted += ' ';
      }

      formatted += input.slice(index, tokenEnd);
      index = tokenEnd;
      previousWasToken = true;
      continue;
    }

    formatted += input[index];
    previousWasToken = false;
    index += 1;
  }

  return formatted;
}

function canStartHarpTab(input: string, index: number, previousWasToken: boolean): boolean {
  if (previousWasToken || index === 0) {
    return true;
  }

  return /[\s([{;,]/.test(input[index - 1]);
}

function readHarpTabToken(input: string, start: number): number | null {
  let index = start;
  const openingQuote = input[index] === '"' || input[index] === "'" ? input[index] : '';

  if (openingQuote) {
    index += 1;
  }

  if (input[index] === '+' || input[index] === '-') {
    index += 1;
  }

  if (input.slice(index, index + 2).match(/^1[0-2]$/)) {
    index += 2;
  } else if (/^[1-9]$/.test(input[index] || '')) {
    index += 1;
  } else {
    return null;
  }

  if (input[index] === ':') {
    const durationStart = index;
    index += 1;

    while (/^[\d/]$/.test(input[index] || '')) {
      index += 1;
    }

    if (index === durationStart + 1) {
      index = durationStart;
    }
  }

  if (openingQuote) {
    if (input[index] === openingQuote) {
      return index + 1;
    }

    return null;
  }

  if (input[index] === '<') {
    index += 1;
  } else if (input[index] === "'" || input[index] === '"') {
    const bendQuote = input[index];
    let bendLength = 0;

    while (input[index] === bendQuote && bendLength < 3) {
      index += 1;
      bendLength += 1;
    }
  }

  return index;
}

function convertTabToABC(input: string, mapping: Record<string, string>) {
  let converted = 0;
  let unknown = 0;

  const text = input.replace(tokenPattern, (match, prefix: string, sign: string, hole: string, duration: string | undefined, slideOrBend: string | undefined, offset: number, source: string) => {
    if (isAfterColon(prefix, offset, source)) {
      return match;
    }

    const normalizedSign = sign === '-' ? '-' : '+';
    const token = `${normalizedSign}${hole}`;
    const abcNote = mapping[token];

    if (!abcNote) {
      unknown += 1;
      return match;
    }

    converted += 1;
    return `${prefix}${abcNote}${normalizeDuration(duration)}`;
  });

  return { text: formatHarpTabs(text), converted, unknown };
}

export function convertDiatonicTabToABC(input: string) {
  return convertTabToABC(input, DIATONIC_TO_ABC);
}

export function convertChromaticTabToABC(input: string) {
  return convertTabToABC(input, CHROMATIC_TO_ABC);
}

function normalizeAbcNote(accidental: string | undefined, note: string, octave: string): string {
  let normalizedNote = note;

  for (const marker of octave) {
    if (marker === "'") {
      normalizedNote = normalizedNote.toLowerCase();
    } else if (marker === ',') {
      normalizedNote = normalizedNote.toUpperCase();
    }
  }

  const normalizedAccidental = accidental === '=' || !accidental ? '' : accidental.slice(0, 1);
  return `${normalizedAccidental}${normalizedNote}`;
}

function normalizeAbcDuration(duration: string | undefined): string {
  return duration ? `:${duration}` : '';
}

function isAbcHeaderLine(line: string): boolean {
  return /^[A-Za-z]:/.test(line.trim());
}

export function convertABCToChromaticTab(input: string) {
  let converted = 0;
  let unknown = 0;

  const text = input
    .split(/\r?\n/)
    .map((line) => {
      if (isAbcHeaderLine(line) || line.trim().startsWith('%%')) {
        return '';
      }

      return line.replace(abcNotePattern, (match, accidental: string | undefined, note: string, octave: string, duration: string | undefined) => {
        const normalizedNote = normalizeAbcNote(accidental, note, octave || '');
        const tab = ABC_TO_CHROMATIC[normalizedNote];

        if (!tab) {
          unknown += 1;
          return match;
        }

        converted += 1;
        return `${tab}${normalizeAbcDuration(duration)}`;
      });
    })
    .filter((line) => line.trim().length > 0)
    .join('\n');

  return { text: formatHarpTabs(text), converted, unknown };
}
