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

const tokenPattern = /(^|[\s([{;:,])([+-]?)(10|[1-9])(:[/\d]+)?('{1,3}|"{1,3}|<)?(?=$|[\s)\]};:,.!?])/g;

function normalizeDuration(duration: string | undefined): string {
  return duration ? duration.slice(1) : '';
}

function convertTabToABC(input: string, mapping: Record<string, string>) {
  let converted = 0;
  let unknown = 0;

  const text = input.replace(tokenPattern, (match, prefix: string, sign: string, hole: string, duration: string | undefined, slideOrBend: string | undefined) => {
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

  return { text, converted, unknown };
}

export function convertDiatonicTabToABC(input: string) {
  return convertTabToABC(input, DIATONIC_TO_ABC);
}

export function convertChromaticTabToABC(input: string) {
  return convertTabToABC(input, CHROMATIC_TO_ABC);
}
