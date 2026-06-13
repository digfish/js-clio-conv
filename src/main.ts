import { App, Notice, Plugin, Modal, MarkdownView, PluginSettingTab, Setting, normalizePath } from 'obsidian';
import abcjs from 'abcjs';
import lamejs from 'lamejs';
import BitStream from 'lamejs/src/js/BitStream.js';
import Lame from 'lamejs/src/js/Lame.js';
import MPEGMode from 'lamejs/src/js/MPEGMode.js';
import { convertDiatonicTabToABC, convertChromaticTabToABC, convertABCToChromaticTab } from './conversion';

(globalThis as any).BitStream = BitStream;
(globalThis as any).Lame = Lame;
(globalThis as any).MPEGMode = MPEGMode;

const HARMONICA_MIDI_PROGRAM = 22;
const DEFAULT_SOUND_OUTPUT_FOLDER = 'harmonica/sounds';
const DEFAULT_SCORE_OUTPUT_FOLDER = 'scores';
const PNG_EXPORT_SCALE = 12;

const MIDI_INSTRUMENT_OPTIONS: Record<string, string> = {
  '0': 'Acoustic grand piano',
  '6': 'Harpsichord',
  '16': 'Drawbar organ',
  '19': 'Church organ',
  '22': 'Harmonica',
  '24': 'Acoustic guitar',
  '25': 'Steel guitar',
  '40': 'Violin',
  '41': 'Viola',
  '42': 'Cello',
  '46': 'Harp',
  '56': 'Trumpet',
  '57': 'Trombone',
  '65': 'Alto sax',
  '68': 'Oboe',
  '71': 'Clarinet',
  '73': 'Flute',
  '75': 'Pan flute',
  '79': 'Ocarina'
};

interface ClioConvSettings {
  soundOutputFolder: string;
  scoreOutputFolder: string;
  midiProgram: number;
}

const DEFAULT_SETTINGS: ClioConvSettings = {
  soundOutputFolder: DEFAULT_SOUND_OUTPUT_FOLDER,
  scoreOutputFolder: DEFAULT_SCORE_OUTPUT_FOLDER,
  midiProgram: HARMONICA_MIDI_PROGRAM
};

const DIATONIC_TO_CHROMATIC_TAB: Record<string, string> = {
  '+1': '+1',
  "-1'": '+1<',
  '-1': '-1',
  '+2': '+2',
  "-2''": '-2',
  "-2'": '-2<',
  '-2': '+3',
  '+3': '+3',
  "-3'''": '+3<',
  "-3''": '-3',
  "-3'": '-3<',
  '-3': '-4',
  '+4': '+4',
  "-4'": '+4<',
  '-4': '-5',
  '+5': '+6',
  '-5': '-6',
  '+6': '+7',
  "-6'": '+7<',
  '-6': '-7',
  "+7'": '-8',
  '+7': '+8',
  '-7': '-8',
  "+8'": '-9<',
  '+8': '+10',
  "-8'": '+8<',
  '-8': '-9',
  "+9'": '-10<',
  '+9': '+11',
  "-9'": '-10<',
  '-9': '-10',
  "+10'''": '-11',
  "+10''": '-11<',
  "+10'": '-12',
  '+10': '+12',
  "-10''": '-11',
  "-10'": '-11<',
  '-10': '-11'
};

const CHROMATIC_TO_DIATONIC_TAB = invertMapping(DIATONIC_TO_CHROMATIC_TAB);

// Harmonica Diatonic (C) to ABC notation mapping
// Starting from C (hole 1 blow = C)
const DIATONIC_TO_ABC: Record<string, string> = {
  '+1': 'C',    // C
  '-1': 'D',    // D
  '+2': 'E',    // E
  '-2': 'F',    // F
  '+3': 'G',    // G
  '-3': 'A',    // A
  '+4': 'B',    // B
  '-4': 'c',    // c (octave up)
  '+5': 'd',    // d
  '-5': 'e',    // e
  '+6': 'f',    // f
  '-6': 'g',    // g
  '+7': 'a',    // a
  '-7': 'b',    // b
  '+8': "c'",   // c' (two octaves up)
  '-8': "d'",   // d'
  '+9': "e'",   // e'
  '-9': "f'",   // f'
  '+10': "g'",  // g'
  '-10': "a'"   // a'
};

// Harmonica Chromatic (C) to ABC notation mapping
// Starting from C (blow 1 = C)
const CHROMATIC_TO_ABC: Record<string, string> = {
  '+1': 'C',    // C
  '-1': '^B',   // B# (enharmonic)
  '+2': '^C',   // C#
  '-2': 'D',    // D
  '+3': '^D',   // D#
  '-3': 'E',    // E
  '+4': 'F',    // F
  '-4': '^F',   // F#
  '+5': 'G',    // G
  '-5': '^G',   // G#
  '+6': 'A',    // A
  '-6': '^A',   // A#
  '+7': 'B',    // B
  '-7': 'c',    // c (octave up)
  '+8': '^c',   // c#
  '-8': 'd',    // d
  '+9': '^d',   // d#
  '-9': 'e',    // e
  '+10': 'f',   // f
  '-10': '^f',  // f#
  '+11': 'g',   // g
  '-11': '^g'   // g#
};

function invertMapping(map: Record<string, string>): Record<string, string> {
  const inverted: Record<string, string> = {};
  for (const key in map) {
    const value = map[key];
    if (!(value in inverted)) {
      inverted[value] = key;
    }
  }
  return inverted;
}

function isAfterColon(prefix: string, offset: number, source: string): boolean {
  let index = offset + prefix.length - 1;

  while (index >= 0 && /\s/.test(source[index])) {
    index -= 1;
  }

  return source[index] === ':';
}

function formatHarpTabs(input: string): string {
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

function convertDiatonicTabToChromatic(input: string): { text: string; converted: number; unknown: number } {
  let converted = 0;
  let unknown = 0;
  const tokenPattern = /(^|[\s([{;,])([+-]?)(10|[1-9])(:\d+)?('{1,3}|"{1,3}|<)?(:\d+)?(?=$|[\s)\]};,.!?])/g;

  const text = input.replace(tokenPattern, (match, prefix: string, sign: string, hole: string, durationBeforeBend: string | undefined, slideOrBend: string | undefined, durationAfterBend: string | undefined, offset: number, source: string) => {
    if (isAfterColon(prefix, offset, source)) {
      return match;
    }

    const duration = durationBeforeBend || durationAfterBend || '';
    const normalizedSign = sign === '-' ? '-' : '+';
    const normalizedSlide = slideOrBend === '<' ? "'" : slideOrBend ? slideOrBend.replace(/"/g, "'") : '';
    const token = `${normalizedSign}${hole}${normalizedSlide}`;
    const fallbackToken = `${normalizedSign}${hole}`;
    const convertedToken = DIATONIC_TO_CHROMATIC_TAB[token] ?? (normalizedSlide ? DIATONIC_TO_CHROMATIC_TAB[fallbackToken] : undefined);

    if (!convertedToken) {
      unknown += 1;
      return match;
    }

    converted += 1;
    return `${prefix}${convertedToken}${duration}`;
  });

  return { text: formatHarpTabs(text), converted, unknown };
}

function convertChromaticTabToDiatonic(input: string): { text: string; converted: number; unknown: number } {
  let converted = 0;
  let unknown = 0;
  const tokenPattern = /(^|[\s([{;,])([+-]?)(10|[1-9])(:\d+)?('{1,3}|"{1,3}|<)?(?=$|[\s)\]};,.!?])/g;

  const text = input.replace(tokenPattern, (match, prefix: string, sign: string, hole: string, duration: string | undefined, slideOrBend: string | undefined, offset: number, source: string) => {
    if (isAfterColon(prefix, offset, source)) {
      return match;
    }

    const normalizedSign = sign === '-' ? '-' : '+';
    const normalizedSlide = slideOrBend ? slideOrBend.replace(/"/g, "'") : '';
    const token = `${normalizedSign}${hole}${normalizedSlide}`;
    const convertedToken = CHROMATIC_TO_DIATONIC_TAB[token];

    if (!convertedToken) {
      unknown += 1;
      return match;
    }

    converted += 1;
    return `${prefix}${convertedToken}${duration || ''}`;
  });

  return { text: formatHarpTabs(text), converted, unknown };
}


function renderABCtoSVG(abcNotation: string): string {
  const container = document.createElement('div');

  try {
    abcjs.renderAbc(container, abcNotation, {
      responsive: 'resize',
      staffwidth: 800
    });

    const svg = container.querySelector('svg');
    if (svg) {
      return serializeSvg(svg);
    }
    return '<p>Failed to render score</p>';
  } catch (error) {
    return `<p>Error processing ABC: ${error}</p>`;
  }
}

function extractTitleFromAbc(abcNotation: string): string | null {
  const match = /^T:\s*(.+)$/m.exec(abcNotation);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

function withMidiProgram(abcNotation: string, program: number, replaceExisting = false): string {
  if (/^%%MIDI\s+program\b/im.test(abcNotation)) {
    if (!replaceExisting) {
      return abcNotation;
    }

    return abcNotation.replace(/^%%MIDI\s+program\b.*$/im, `%%MIDI program ${program}`);
  }

  return `%%MIDI program ${program}\n${abcNotation}`;
}

function buildAbcDocument(notes: string, title = 'Harmonica Score', midiProgram = HARMONICA_MIDI_PROGRAM): string {
  const normalizedNotes = notes.trim();

  if (/^X:\s*\d+/im.test(normalizedNotes)) {
    return withMidiProgram(normalizedNotes, midiProgram);
  }

  return [
    'X:1',
    `T:${title}`,
    'M:4/4',
    'L:1/4',
    'K:C',
    `%%MIDI program ${midiProgram}`,
    normalizedNotes
  ].join('\n');
}

function serializeSvg(svg: SVGElement): string {
  const clonedSvg = svg.cloneNode(true) as SVGElement;
  if (!clonedSvg.getAttribute('xmlns')) {
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clonedSvg)}`;
}

async function convertSvgToPngBlob(svg: SVGElement): Promise<Blob> {
  const svgText = serializeSvg(svg);
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load SVG image'));
    });

    image.src = url;
    await loaded;

    const viewBox = svg.getAttribute('viewBox')?.split(/\s+/).map(Number);
    const width = Math.ceil(
      image.naturalWidth ||
      svg.viewBox.baseVal.width ||
      (viewBox && viewBox.length === 4 ? viewBox[2] : 0) ||
      svg.getBoundingClientRect().width
    );
    const height = Math.ceil(
      image.naturalHeight ||
      svg.viewBox.baseVal.height ||
      (viewBox && viewBox.length === 4 ? viewBox[3] : 0) ||
      svg.getBoundingClientRect().height
    );

    if (!width || !height) {
      throw new Error('Could not determine SVG dimensions');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width * PNG_EXPORT_SCALE;
    canvas.height = height * PNG_EXPORT_SCALE;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create PNG canvas');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to generate PNG data'));
        }
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getMidiData(abcNotation: string, midiProgram: number): ArrayBuffer {
  const result = (abcjs as any).synth.getMidiFile(withMidiProgram(abcNotation, midiProgram, true), {
    midiOutputType: 'binary'
  });
  const midiData = Array.isArray(result) ? result[0] : result;

  if (!midiData || !(midiData instanceof Uint8Array)) {
    throw new Error('Failed to generate MIDI data');
  }

  return new Uint8Array(midiData).buffer;
}

async function getAudioBuffer(visualObj: any): Promise<AudioBuffer> {
  const synth = new (abcjs as any).synth.CreateSynth();
  await synth.init({ visualObj });
  await synth.prime();

  const audioBuffer = synth.getAudioBuffer();
  if (!audioBuffer) {
    throw new Error('Failed to generate audio data');
  }

  return audioBuffer;
}

async function getWavData(visualObj: any): Promise<ArrayBuffer> {
  return audioBufferToWav(await getAudioBuffer(visualObj));
}

async function getMp3Data(visualObj: any): Promise<ArrayBuffer> {
  return audioBufferToMp3(await getAudioBuffer(visualObj));
}

function audioBufferToWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = numberOfChannels * bytesPerSample;
  const dataSize = audioBuffer.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset, value.charCodeAt(i));
      offset += 1;
    }
  };

  const writeUint16 = (value: number) => {
    view.setUint16(offset, value, true);
    offset += 2;
  };

  const writeUint32 = (value: number) => {
    view.setUint32(offset, value, true);
    offset += 4;
  };

  writeString('RIFF');
  writeUint32(36 + dataSize);
  writeString('WAVE');
  writeString('fmt ');
  writeUint32(16);
  writeUint16(1);
  writeUint16(numberOfChannels);
  writeUint32(sampleRate);
  writeUint32(sampleRate * blockAlign);
  writeUint16(blockAlign);
  writeUint16(bytesPerSample * 8);
  writeString('data');
  writeUint32(dataSize);

  const channelData = Array.from({ length: numberOfChannels }, (_, channel) => audioBuffer.getChannelData(channel));

  for (let i = 0; i < audioBuffer.length; i += 1) {
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return buffer;
}

function audioBufferToMp3(audioBuffer: AudioBuffer, bitRate = 128): ArrayBuffer {
  const channelCount = Math.min(audioBuffer.numberOfChannels, 2);
  const sampleRate = audioBuffer.sampleRate;
  const mp3Encoder = new lamejs.Mp3Encoder(channelCount, sampleRate, bitRate);
  const samples = Array.from({ length: channelCount }, (_, channel) => audioBufferChannelToInt16(audioBuffer.getChannelData(channel)));
  const blockSize = 1152;
  const mp3Chunks: Uint8Array[] = [];

  for (let offset = 0; offset < audioBuffer.length; offset += blockSize) {
    const left = samples[0].subarray(offset, offset + blockSize);
    const chunk = channelCount === 2
      ? mp3Encoder.encodeBuffer(left, samples[1].subarray(offset, offset + blockSize))
      : mp3Encoder.encodeBuffer(left);

    if (chunk.length > 0) {
      mp3Chunks.push(chunk);
    }
  }

  const finalChunk = mp3Encoder.flush();
  if (finalChunk.length > 0) {
    mp3Chunks.push(finalChunk);
  }

  const byteLength = mp3Chunks.reduce((total, chunk) => total + chunk.length, 0);
  const mp3Data = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of mp3Chunks) {
    mp3Data.set(chunk, offset);
    offset += chunk.length;
  }

  if (mp3Data.length === 0) {
    throw new Error('Failed to generate MP3 data');
  }

  return mp3Data.buffer;
}

function audioBufferChannelToInt16(channelData: Float32Array): Int16Array {
  const samples = new Int16Array(channelData.length);

  for (let index = 0; index < channelData.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, channelData[index]));
    samples[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return samples;
}

function sanitizeFilename(filename: string): string {
  return filename
    .trim()
    .replace(/[\\/:*?"<>|#^[\]]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'score';
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const normalizedPath = normalizePath(folderPath);

  let currentPath = '';
  for (const part of normalizedPath.split('/')) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;

    if (!app.vault.getFolderByPath(currentPath)) {
      await app.vault.createFolder(currentPath);
    }
  }
}

async function getAvailableVaultPath(app: App, folderPath: string, filename: string, extension: string): Promise<string> {
  const baseName = sanitizeFilename(filename);
  let path = normalizePath(`${folderPath}/${baseName}.${extension}`);
  let index = 2;

  while (app.vault.getAbstractFileByPath(path)) {
    path = normalizePath(`${folderPath}/${baseName}-${index}.${extension}`);
    index += 1;
  }

  return path;
}

function selectCurrentMusicCodeBlock(editor: any): boolean {
  const cursor = editor.getCursor();
  const block = getCurrentMusicCodeBlock(editor, cursor.line);

  if (!block) {
    return false;
  }

  editor.setSelection(
    { line: block.opening.line + 1, ch: 0 },
    { line: block.closingLine, ch: 0 }
  );
  return true;
}

function getCurrentMusicCodeBlock(editor: any, fromLine: number): { opening: { line: number; marker: string; markerLength: number; language: string }; closingLine: number; text: string } | null {
  const opening = findOpeningMusicFence(editor, fromLine);

  if (!opening || fromLine <= opening.line) {
    return null;
  }

  const closingLine = findClosingFence(editor, opening.line + 1, opening.marker, opening.markerLength);

  if (closingLine === null || fromLine >= closingLine) {
    return null;
  }

  const lines: string[] = [];

  for (let line = opening.line; line <= closingLine; line += 1) {
    lines.push(editor.getLine(line) || '');
  }

  return { opening, closingLine, text: lines.join('\n') };
}

function duplicateCurrentMusicCodeBlock(editor: any): boolean {
  const cursor = editor.getCursor();
  const block = getCurrentMusicCodeBlock(editor, cursor.line);

  if (!block) {
    return false;
  }

  const closingText = editor.getLine(block.closingLine) || '';
  editor.replaceRange(`\n${block.text}`, { line: block.closingLine, ch: closingText.length });
  return true;
}

async function copyCurrentMusicCodeBlock(editor: any): Promise<boolean> {
  const cursor = editor.getCursor();
  const block = getCurrentMusicCodeBlock(editor, cursor.line);

  if (!block) {
    return false;
  }

  await navigator.clipboard.writeText(block.text);
  return true;
}

function findOpeningMusicFence(editor: any, fromLine: number): { line: number; marker: string; markerLength: number; language: string } | null {
  for (let line = fromLine; line >= 0; line -= 1) {
    const match = /^(\s*)(`{3,})\s*([^\s`]*)?.*$/.exec(editor.getLine(line) || '');

    if (!match) {
      continue;
    }

    const language = (match[3] || '').toLowerCase();
    if (language === 'abc' || language === 'harptab' || language === 'diatonic' || language === 'chromatic') {
      return { line, marker: match[2][0], markerLength: match[2].length, language };
    }
  }

  return null;
}

function setCurrentMusicFenceLanguage(editor: any, fromLine: number, language: string): void {
  const opening = findOpeningMusicFence(editor, fromLine);

  if (!opening) {
    return;
  }

  const closingLine = findClosingFence(editor, opening.line + 1, opening.marker, opening.markerLength);

  if (closingLine === null || fromLine <= opening.line || fromLine >= closingLine) {
    return;
  }

  const line = editor.getLine(opening.line) || '';
  const marker = opening.marker.repeat(opening.markerLength);
  const match = new RegExp(`^(\\s*${marker}\\s*)([^\\s${opening.marker}]*)?(.*)$`).exec(line);

  if (!match) {
    return;
  }

  editor.setLine(opening.line, `${match[1]}${language}${match[3] || ''}`);
}

function findClosingFence(editor: any, fromLine: number, marker: string, markerLength: number): number | null {
  for (let line = fromLine; line < editor.lineCount(); line += 1) {
    const trimmedLine = (editor.getLine(line) || '').trim();
    if (trimmedLine.length >= markerLength && Array.from(trimmedLine).every((char) => char === marker)) {
      return line;
    }
  }

  return null;
}

function isAudioReferenceLine(line: string): boolean {
  return /^\s*!?\[\[.+\.(mid|mp3|wav)(?:\|[^\]]*)?\]\]\s*$/i.test(line);
}

function insertSoundReferenceAfterOrigin(editor: any, originLine: number, path: string): void {
  const opening = findOpeningMusicFence(editor, originLine);
  let insertLine = originLine;

  if (opening && originLine > opening.line) {
    const closingLine = findClosingFence(editor, opening.line + 1, opening.marker, opening.markerLength);

    if (closingLine !== null && originLine < closingLine) {
      insertLine = closingLine;
    }
  }

  while (insertLine + 1 < editor.lineCount() && isAudioReferenceLine(editor.getLine(insertLine + 1) || '')) {
    insertLine += 1;
  }

  const line = editor.getLine(insertLine) || '';
  editor.replaceRange(`\n![[${path}]]`, { line: insertLine, ch: line.length });
}

function isFencedCodeBlock(text: string): boolean {
  const trimmed = text.trim();
  return /^`{3,}[^\n\r]*(?:\r?\n[\s\S]*)?\r?\n`{3,}$/.test(trimmed);
}

function getFencedCodeBlockContent(text: string): string | null {
  const match = /^`{3,}[^\n\r]*\r?\n([\s\S]*?)\r?\n`{3,}$/.exec(text.trim());
  return match ? match[1] : null;
}

function buildLabeledCodeBlock(language: string, text: string): string {
  return `\`\`\`${language}\n${text.trim()}\n\`\`\``;
}

function formatGeneratedLabeledTab(source: string, text: string, language: string): string {
  return isFencedCodeBlock(source) ? buildLabeledCodeBlock(language, text) : text;
}

class ABCViewerModal extends Modal {
  abcNotation: string;
  soundOutputFolder: string;
  scoreOutputFolder: string;
  midiProgram: number;
  onSoundSaved?: (path: string) => void | Promise<void>;

  constructor(app: App, abcNotation: string, soundOutputFolder: string, scoreOutputFolder: string, midiProgram: number, onSoundSaved?: (path: string) => void | Promise<void>) {
    super(app);
    this.abcNotation = abcNotation;
    this.soundOutputFolder = soundOutputFolder;
    this.scoreOutputFolder = scoreOutputFolder;
    this.midiProgram = midiProgram;
    this.onSoundSaved = onSoundSaved;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Score Viewer' });

    try {
      const container = contentEl.createDiv({ cls: 'abc-render-container' });
      container.style.overflowX = 'auto';
      container.style.padding = '10px';

      const abcForAudio = withMidiProgram(this.abcNotation, this.midiProgram, true);
      const renderedTunes = abcjs.renderAbc(container, abcForAudio, {
        responsive: 'resize',
        staffwidth: 800
      });
      const visualObj = Array.isArray(renderedTunes) ? renderedTunes[0] : renderedTunes;

      const btnRow = contentEl.createDiv({ cls: 'modal-button-row' });
      btnRow.style.display = 'flex';
      btnRow.style.gap = '8px';
      btnRow.style.marginTop = '16px';

      const exportSvgBtn = btnRow.createEl('button', { text: 'SVG' }) as HTMLButtonElement;
      const savePngBtn = btnRow.createEl('button', { text: 'PNG' }) as HTMLButtonElement;
      const saveMidiBtn = btnRow.createEl('button', { text: 'MIDI' }) as HTMLButtonElement;
      const saveWavBtn = btnRow.createEl('button', { text: 'WAV' }) as HTMLButtonElement;
      const saveMp3Btn = btnRow.createEl('button', { text: 'MP3' }) as HTMLButtonElement;
      const closeBtn = btnRow.createEl('button', { text: 'Close' }) as HTMLButtonElement;

      exportSvgBtn.onclick = async () => {
        try {
          exportSvgBtn.disabled = true;
          exportSvgBtn.textContent = 'Saving...';

          const svg = container.querySelector('svg');
          if (!svg) {
            new Notice('Error finding SVG');
            return;
          }

          const folderPath = getScoreOutputFolder(this.scoreOutputFolder);
          await ensureFolder(this.app, folderPath);

          const svgText = serializeSvg(svg);
          const title = extractTitleFromAbc(this.abcNotation) || 'score';
          const path = await getAvailableVaultPath(this.app, folderPath, title, 'svg');
          await this.app.vault.create(path, svgText);
          new Notice(`SVG saved to ${path}`);
        } catch (error) {
          new Notice(`Error saving SVG: ${error}`);
        } finally {
          exportSvgBtn.disabled = false;
          exportSvgBtn.textContent = 'SVG';
        }
      };

      savePngBtn.onclick = async () => {
        try {
          savePngBtn.disabled = true;
          savePngBtn.textContent = 'Saving...';

          const svg = container.querySelector('svg');
          if (!svg) {
            new Notice('Error finding SVG');
            return;
          }

          const folderPath = getScoreOutputFolder(this.scoreOutputFolder);
          await ensureFolder(this.app, folderPath);

          const pngBlob = await convertSvgToPngBlob(svg);
          const title = extractTitleFromAbc(this.abcNotation) || 'score';
          const path = await getAvailableVaultPath(this.app, folderPath, title, 'png');
          await this.app.vault.createBinary(path, await pngBlob.arrayBuffer());
          new Notice(`PNG saved to ${path}`);
        } catch (error) {
          new Notice(`Error saving PNG: ${error}`);
        } finally {
          savePngBtn.disabled = false;
          savePngBtn.textContent = 'PNG';
        }
      };

      saveMidiBtn.onclick = async () => {
        try {
          saveMidiBtn.disabled = true;
          saveMidiBtn.textContent = 'Saving...';
          const folderPath = getSoundOutputFolder(this.soundOutputFolder);
          await ensureFolder(this.app, folderPath);

          const midiData = getMidiData(this.abcNotation, this.midiProgram);
          const title = extractTitleFromAbc(this.abcNotation) || 'score';
          const path = await getAvailableVaultPath(this.app, folderPath, title, 'mid');
          await this.app.vault.createBinary(path, midiData);
          await this.onSoundSaved?.(path);

          new Notice(`MIDI saved to ${path}`);
        } catch (error) {
          new Notice(`Error saving MIDI: ${error}`);
        } finally {
          saveMidiBtn.disabled = false;
          saveMidiBtn.textContent = 'MIDI';
        }
      };

      saveWavBtn.onclick = async () => {
        try {
          saveWavBtn.disabled = true;
          saveWavBtn.textContent = 'Generating...';

          if (!visualObj) {
            new Notice('Error finding rendered score');
            return;
          }

          const folderPath = getSoundOutputFolder(this.soundOutputFolder);
          await ensureFolder(this.app, folderPath);

          const wavData = await getWavData(visualObj);
          const title = extractTitleFromAbc(this.abcNotation) || 'score';
          const path = await getAvailableVaultPath(this.app, folderPath, title, 'wav');
          await this.app.vault.createBinary(path, wavData);
          await this.onSoundSaved?.(path);

          new Notice(`WAV saved to ${path}`);
        } catch (error) {
          new Notice(`Error saving WAV: ${error}`);
        } finally {
          saveWavBtn.disabled = false;
          saveWavBtn.textContent = 'WAV';
        }
      };

      saveMp3Btn.onclick = async () => {
        try {
          saveMp3Btn.disabled = true;
          saveMp3Btn.textContent = 'Generating...';

          if (!visualObj) {
            new Notice('Error finding rendered score');
            return;
          }

          const folderPath = getSoundOutputFolder(this.soundOutputFolder);
          await ensureFolder(this.app, folderPath);

          const mp3Data = await getMp3Data(visualObj);
          const title = extractTitleFromAbc(this.abcNotation) || 'score';
          const path = await getAvailableVaultPath(this.app, folderPath, title, 'mp3');
          await this.app.vault.createBinary(path, mp3Data);
          await this.onSoundSaved?.(path);

          new Notice(`MP3 saved to ${path}`);
        } catch (error) {
          new Notice(`Error saving MP3: ${error}`);
        } finally {
          saveMp3Btn.disabled = false;
          saveMp3Btn.textContent = 'MP3';
        }
      };

      closeBtn.onclick = () => {
        this.close();
      };

    } catch (error) {
      contentEl.createEl('p', { text: `Error rendering: ${error}` });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}


export default class MyPlugin extends Plugin {
  settings!: ClioConvSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ClioConvSettingTab(this.app, this));

    this.addCommand({
      id: 'select-current-music-code-block',
      name: 'Select current music code block',
      editorCallback: (editor) => {
        if (selectCurrentMusicCodeBlock(editor)) {
          new Notice('Code block selected.');
        } else {
          new Notice('Place the cursor inside an ABC, harptab, diatonic, or chromatic code block.');
        }
      }
    });

    this.addCommand({
      id: 'duplicate-current-music-code-block',
      name: 'Duplicate music code block',
      editorCallback: (editor) => {
        if (duplicateCurrentMusicCodeBlock(editor)) {
          new Notice('Music code block duplicated.');
        } else {
          new Notice('Place the cursor inside an ABC, harptab, diatonic, or chromatic code block.');
        }
      }
    });

    this.addCommand({
      id: 'copy-current-music-code-block',
      name: 'Copy music code block',
      editorCallback: async (editor) => {
        try {
          if (await copyCurrentMusicCodeBlock(editor)) {
            new Notice('Music code block copied to clipboard.');
          } else {
            new Notice('Place the cursor inside an ABC, harptab, diatonic, or chromatic code block.');
          }
        } catch (error) {
          new Notice(`Error copying music code block: ${error}`);
        }
      }
    });

    this.addCommand({
      id: 'make-sentence-markdown-title',
      name: 'Convert sentence to Markdown title',
      editorCallback: (editor, view) => {
        const selection = editor.getSelection();
        let text = selection;
        let replacedViaLine = false;
        if (!text || text.length === 0) {
          const cursor = editor.getCursor();
          text = editor.getLine(cursor.line) || '';
          replacedViaLine = true;
        }

        const trimmed = (text || '').trim();
        const withoutHashes = trimmed.replace(/^#+\s*/, '');
        const withoutTerminalPunc = withoutHashes.replace(/[.?!]$/g, '');
        const newText = '# ' + withoutTerminalPunc;

        if (replacedViaLine) {
          const cursor = editor.getCursor();
          editor.setLine(cursor.line, newText);
        } else {
          editor.replaceSelection(newText);
        }

        new Notice('Sentence converted to Markdown title.');
      }
    });

    this.addCommand({
      id: 'convert-diatonic-tab-to-chromatic',
      name: 'Convert diatonic tab to chromatic',
      editorCallback: (editor, view) => {
        const selection = editor.getSelection();

        if (selection.length > 0) {
          const conversionSource = getFencedCodeBlockContent(selection) ?? selection;
          const result = convertDiatonicTabToChromatic(conversionSource);
          editor.replaceSelection(formatGeneratedLabeledTab(selection, result.text, 'chromatic'));
          if (!isFencedCodeBlock(selection)) {
            setCurrentMusicFenceLanguage(editor, editor.getCursor().line, 'chromatic');
          }
          const ignored = result.unknown > 0 ? `, ${result.unknown} not recognized` : '';
          new Notice(`Tab converted: ${result.converted} note(s)${ignored}.`);
          return;
        }

        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line) || '';
        const result = convertDiatonicTabToChromatic(line);
        editor.setLine(cursor.line, result.text);
        setCurrentMusicFenceLanguage(editor, cursor.line, 'chromatic');
        const ignored = result.unknown > 0 ? `, ${result.unknown} not recognized` : '';
        new Notice(`Line converted: ${result.converted} note(s)${ignored}.`);
      }
    });

    this.addCommand({
      id: 'convert-chromatic-tab-to-diatonic',
      name: 'Convert chromatic tab to diatonic',
      editorCallback: (editor, view) => {
        const selection = editor.getSelection();

        if (selection.length > 0) {
          const conversionSource = getFencedCodeBlockContent(selection) ?? selection;
          const result = convertChromaticTabToDiatonic(conversionSource);
          editor.replaceSelection(formatGeneratedLabeledTab(selection, result.text, 'diatonic'));
          if (!isFencedCodeBlock(selection)) {
            setCurrentMusicFenceLanguage(editor, editor.getCursor().line, 'diatonic');
          }
          const ignored = result.unknown > 0 ? `, ${result.unknown} not recognized` : '';
          new Notice(`Tab converted: ${result.converted} note(s)${ignored}.`);
          return;
        }

        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line) || '';
        const result = convertChromaticTabToDiatonic(line);
        editor.setLine(cursor.line, result.text);
        setCurrentMusicFenceLanguage(editor, cursor.line, 'diatonic');
        const ignored = result.unknown > 0 ? `, ${result.unknown} not recognized` : '';
        new Notice(`Line converted: ${result.converted} note(s)${ignored}.`);
      }
    });

    this.addCommand({
      id: 'convert-diatonic-tab-to-abc',
      name: 'Convert diatonic tab to ABC',
      editorCallback: (editor, view) => {
        const selection = editor.getSelection();
        const mdView = view as MarkdownView;
        const mdBaseName = mdView?.file?.name ? mdView.file.name.replace(/\.md$/i, '') : 'score';

        if (selection.length > 0) {
          const result = convertDiatonicTabToABC(selection);
          editor.replaceSelection(buildAbcDocument(result.text, mdBaseName, getMidiProgram(this.settings)));
          const ignored = result.unknown > 0 ? `, ${result.unknown} not recognized` : '';
          new Notice(`Tab converted to ABC: ${result.converted} note(s)${ignored}.`);
          return;
        }

        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line) || '';
        const result = convertDiatonicTabToABC(line);
        editor.replaceRange(buildAbcDocument(result.text, mdBaseName, getMidiProgram(this.settings)), { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
        const ignored = result.unknown > 0 ? `, ${result.unknown} not recognized` : '';
        new Notice(`Line converted to ABC: ${result.converted} note(s)${ignored}.`);
      }
    });

    this.addCommand({
      id: 'convert-chromatic-tab-to-abc',
      name: 'Convert chromatic tab to ABC',
      editorCallback: (editor, view) => {
        const selection = editor.getSelection();
        const mdView = view as MarkdownView;
        const mdBaseName = mdView?.file?.name ? mdView.file.name.replace(/\.md$/i, '') : 'score';

        if (selection.length > 0) {
          const result = convertChromaticTabToABC(selection);
          editor.replaceSelection(buildAbcDocument(result.text, mdBaseName, getMidiProgram(this.settings)));
          const ignored = result.unknown > 0 ? `, ${result.unknown} not recognized` : '';
          new Notice(`Tab converted to ABC: ${result.converted} note(s)${ignored}.`);
          return;
        }

        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line) || '';
        const result = convertChromaticTabToABC(line);
        editor.replaceRange(buildAbcDocument(result.text, mdBaseName, getMidiProgram(this.settings)), { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
        const ignored = result.unknown > 0 ? `, ${result.unknown} not recognized` : '';
        new Notice(`Line converted to ABC: ${result.converted} note(s)${ignored}.`);
      }
    });

    this.addCommand({
      id: 'convert-abc-to-chromatic-tab',
      name: 'Convert ABC to chromatic tab',
      editorCallback: (editor, view) => {
        const selection = editor.getSelection();

        if (selection.length > 0) {
          const conversionSource = getFencedCodeBlockContent(selection) ?? selection;
          const result = convertABCToChromaticTab(conversionSource);
          editor.replaceSelection(formatGeneratedLabeledTab(selection, result.text, 'chromatic'));
          if (!isFencedCodeBlock(selection)) {
            setCurrentMusicFenceLanguage(editor, editor.getCursor().line, 'chromatic');
          }
          const ignored = result.unknown > 0 ? `, ${result.unknown} not recognized` : '';
          new Notice(`ABC converted to chromatic tab: ${result.converted} note(s)${ignored}.`);
          return;
        }

        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line) || '';
        const result = convertABCToChromaticTab(line);
        editor.setLine(cursor.line, result.text);
        setCurrentMusicFenceLanguage(editor, cursor.line, 'chromatic');
        const ignored = result.unknown > 0 ? `, ${result.unknown} not recognized` : '';
        new Notice(`Line converted to chromatic tab: ${result.converted} note(s)${ignored}.`);
      }
    });

    this.addCommand({
      id: 'view-abc-notation',
      name: 'View ABC score',
      editorCallback: (editor, view) => {
        const selection = editor.getSelection();
        let abcText = selection;
        const originLine = editor.getCursor().line;

        if (!abcText || abcText.length === 0) {
          const block = getCurrentMusicCodeBlock(editor, originLine);

          if (block?.opening.language === 'abc') {
            editor.setSelection(
              { line: block.opening.line + 1, ch: 0 },
              { line: block.closingLine, ch: 0 }
            );
            abcText = getFencedCodeBlockContent(block.text) ?? block.text;
          } else {
            abcText = editor.getLine(originLine) || '';
          }
        }

        if (!abcText.trim()) {
          new Notice('Select or place cursor on a line with ABC notation');
          return;
        }

        const modal = new ABCViewerModal(this.app, abcText, this.settings.soundOutputFolder, this.settings.scoreOutputFolder, getMidiProgram(this.settings), (path) => {
          insertSoundReferenceAfterOrigin(editor, originLine, path);
        });
        modal.open();
      }
    });

    this.addCommand({
      id: 'render-abc-to-svg',
      name: 'Render ABC to SVG',
      editorCallback: (editor, view) => {
        const selection = editor.getSelection();
        let abcText = selection;

        if (!abcText || abcText.length === 0) {
          const cursor = editor.getCursor();
          abcText = editor.getLine(cursor.line) || '';
        }

        if (!abcText.trim()) {
          new Notice('Select or place cursor on a line with ABC notation');
          return;
        }

        try {
          const tempDiv = document.createElement('div');
          document.body.appendChild(tempDiv);

          abcjs.renderAbc(tempDiv, abcText, {
            responsive: 'resize',
            staffwidth: 800
          });

          const svg = tempDiv.querySelector('svg');
          if (svg) {
            const svgText = svg.outerHTML;
            const line = editor.getCursor().line;
            editor.setLine(line, `<!-- SVG: ${svgText.substring(0, 50)}... -->`);
            new Notice('SVG generated and inserted as comment');
          } else {
            new Notice('Error generating SVG');
          }

          document.body.removeChild(tempDiv);
        } catch (error) {
          new Notice(`Error rendering ABC: ${error}`);
        }
      }
    });

  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.soundOutputFolder = getSoundOutputFolder(this.settings.soundOutputFolder);
    this.settings.scoreOutputFolder = getScoreOutputFolder(this.settings.scoreOutputFolder);
    this.settings.midiProgram = getMidiProgram(this.settings);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

function getSoundOutputFolder(folderPath: string): string {
  return normalizePath(folderPath.trim() || DEFAULT_SOUND_OUTPUT_FOLDER);
}

function getScoreOutputFolder(folderPath: string): string {
  return normalizePath(folderPath.trim() || DEFAULT_SCORE_OUTPUT_FOLDER);
}

function getMidiProgram(settings: ClioConvSettings): number {
  const program = Number(settings.midiProgram);
  return Number.isInteger(program) && MIDI_INSTRUMENT_OPTIONS[String(program)] ? program : HARMONICA_MIDI_PROGRAM;
}

class ClioConvSettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.createEl('h2', { text: 'Clio Conv settings' });

    new Setting(containerEl)
      .setName('Sound output folder')
      .setDesc('Vault folder where MIDI, WAV, and MP3 files are saved.')
      .addText((text) => text
        .setPlaceholder(DEFAULT_SOUND_OUTPUT_FOLDER)
        .setValue(this.plugin.settings.soundOutputFolder)
        .onChange(async (value) => {
          this.plugin.settings.soundOutputFolder = getSoundOutputFolder(value);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Score PNG output folder')
      .setDesc('Vault folder where generated score PNG files are saved.')
      .addText((text) => text
        .setPlaceholder(DEFAULT_SCORE_OUTPUT_FOLDER)
        .setValue(this.plugin.settings.scoreOutputFolder)
        .onChange(async (value) => {
          this.plugin.settings.scoreOutputFolder = getScoreOutputFolder(value);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('MIDI instrument')
      .setDesc('Instrument used when generating MIDI, WAV, and MP3 files.')
      .addDropdown((dropdown) => dropdown
        .addOptions(MIDI_INSTRUMENT_OPTIONS)
        .setValue(String(getMidiProgram(this.plugin.settings)))
        .onChange(async (value) => {
          this.plugin.settings.midiProgram = Number(value);
          await this.plugin.saveSettings();
        }));
  }
}


