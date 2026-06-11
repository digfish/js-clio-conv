import { convertDiatonicTabToABC, convertChromaticTabToABC } from '../src/conversion.js';

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

  const chromatic = convertChromaticTabToABC('+1:4 -1:2 +2:8');
  assertEqual(chromatic.text, 'C4 ^B2 ^C8', 'Chromatic tab to ABC should remove colon from durations');

  console.log('PASS');
}

run();
