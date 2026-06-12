import { convertDiatonicTabToABC, convertChromaticTabToABC, convertABCToChromaticTab, formatHarpTabs } from '../src/conversion.js';

function assertEqual(actual: string, expected: string, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function run() {
  const diatonic = convertDiatonicTabToABC('+1:4 -1:2 +2:8');
  assertEqual(diatonic.text, 'C4 D2 E8', 'Diatonic tab to ABC should remove colon from durations');

  const diatonicFractional = convertDiatonicTabToABC('+4:/2 -4:1/2');
  assertEqual(diatonicFractional.text, 'c/2 d1/2', 'Diatonic tab with fractional durations should work');

  const diatonicWithTimeMarker = convertDiatonicTabToABC('1: 2 +1:4 -1');
  assertEqual(diatonicWithTimeMarker.text, '1: 2 C4 D', 'Diatonic tab to ABC should not convert numbers after colons');

  const chromatic = convertChromaticTabToABC('+1:4 -1:2 +2:8');
  assertEqual(chromatic.text, 'C4 ^B2 ^C8', 'Chromatic tab to ABC should remove colon from durations');

  const chromaticWithTimeMarker = convertChromaticTabToABC('tempo: 4 +1:4 -1');
  assertEqual(chromaticWithTimeMarker.text, 'tempo: 4 C4 ^B', 'Chromatic tab to ABC should not convert numbers after colons');

  const abc = convertABCToChromaticTab('C2 ^C/2 D E | F G A B | c d e f g');
  assertEqual(abc.text, '+1:2 +2:/2 -2 -3 | +4 +5 +6 +7 | -7 -8 -9 +10 +11', 'ABC should convert to chromatic tab');

  const compactAbc = convertABCToChromaticTab('CDE');
  assertEqual(compactAbc.text, '+1 -2 -3', 'ABC converted to chromatic tab should separate adjacent tokens');

  const compactAbcWithDurations = convertABCToChromaticTab('C2D3E4');
  assertEqual(compactAbcWithDurations.text, '+1:2 -2:3 -3:4', 'ABC converted to chromatic tab should separate adjacent tokens with durations');

  const formattedHarpTabs = formatHarpTabs('"2:4"-2+2');
  assertEqual(formattedHarpTabs, '"2:4" -2 +2', 'Harp tab formatter should separate adjacent quoted and unquoted tokens');

  const abcDocument = convertABCToChromaticTab(['X:1', 'T:Scale', 'M:4/4', 'L:1/4', 'K:C', 'C D _E ^F'].join('\n'));
  assertEqual(abcDocument.text, '+1 -2 +3 -4', 'ABC document headers should be ignored');

  console.log('PASS');
}

run();
