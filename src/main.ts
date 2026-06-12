import { App, Notice, Plugin, Modal, MarkdownView, PluginSettingTab, Setting, normalizePath } from 'obsidian';
import abcjs from 'abcjs';
import { convertDiatonicTabToABC, convertChromaticTabToABC, convertABCToChromaticTab } from './conversion';

const HARMONICA_MIDI_PROGRAM = 22;
const DEFAULT_SOUND_OUTPUT_FOLDER = 'harmonica/sounds';

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
  midiProgram: number;
}

const DEFAULT_SETTINGS: ClioConvSettings = {
  soundOutputFolder: DEFAULT_SOUND_OUTPUT_FOLDER,
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

function convertDiatonicTabToChromatic(input: string): { text: string; converted: number; unknown: number } {
  let converted = 0;
  let unknown = 0;
  const tokenPattern = /(^|[\s([{;:,])([+-]?)(10|[1-9])(:\d+)?('{1,3}|"{1,3}|<)?(?=$|[\s)\]};:,.!?])/g;

  const text = input.replace(tokenPattern, (match, prefix: string, sign: string, hole: string, duration: string | undefined, slideOrBend: string | undefined) => {
    const normalizedSign = sign === '-' ? '-' : '+';
    const normalizedSlide = slideOrBend === '<' ? "'" : slideOrBend ? slideOrBend.replace(/"/g, "'") : '';
    const token = `${normalizedSign}${hole}${normalizedSlide}`;
    const convertedToken = DIATONIC_TO_CHROMATIC_TAB[token];

    if (!convertedToken) {
      unknown += 1;
      return match;
    }

    converted += 1;
    return `${prefix}${convertedToken}${duration || ''}`;
  });

  return { text, converted, unknown };
}

function convertChromaticTabToDiatonic(input: string): { text: string; converted: number; unknown: number } {
  let converted = 0;
  let unknown = 0;
  const tokenPattern = /(^|[\s([{;:,])([+-]?)(10|[1-9])(:\d+)?('{1,3}|"{1,3}|<)?(?=$|[\s)\]};:,.!?])/g;

  const text = input.replace(tokenPattern, (match, prefix: string, sign: string, hole: string, duration: string | undefined, slideOrBend: string | undefined) => {
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

  return { text, converted, unknown };
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

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

async function getWavData(visualObj: any): Promise<ArrayBuffer> {
  const synth = new (abcjs as any).synth.CreateSynth();
  await synth.init({ visualObj });
  await synth.prime();

  const audioBuffer = synth.getAudioBuffer();
  if (!audioBuffer) {
    throw new Error('Failed to generate WAV data');
  }

  return audioBufferToWav(audioBuffer);
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

class ABCViewerModal extends Modal {
  abcNotation: string;
  soundOutputFolder: string;
  midiProgram: number;
  onWavSaved?: (path: string) => void | Promise<void>;

  constructor(app: App, abcNotation: string, soundOutputFolder: string, midiProgram: number, onWavSaved?: (path: string) => void | Promise<void>) {
    super(app);
    this.abcNotation = abcNotation;
    this.soundOutputFolder = soundOutputFolder;
    this.midiProgram = midiProgram;
    this.onWavSaved = onWavSaved;
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

      const exportSvgBtn = btnRow.createEl('button', { text: 'Download SVG' }) as HTMLButtonElement;
      const saveMidiBtn = btnRow.createEl('button', { text: 'Save MIDI' }) as HTMLButtonElement;
      const saveWavBtn = btnRow.createEl('button', { text: 'Save WAV' }) as HTMLButtonElement;
      const closeBtn = btnRow.createEl('button', { text: 'Close' }) as HTMLButtonElement;

      exportSvgBtn.onclick = () => {
        try {
          const svg = container.querySelector('svg');
          if (!svg) {
            new Notice('Error finding SVG');
            return;
          }

          const svgText = serializeSvg(svg);
          const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
          const title = extractTitleFromAbc(this.abcNotation) || 'score';
          downloadBlob(blob, `${sanitizeFilename(title)}.svg`);
          new Notice('SVG downloaded successfully');
        } catch (error) {
          new Notice(`Error downloading SVG: ${error}`);
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

          new Notice(`MIDI saved to ${path}`);
        } catch (error) {
          new Notice(`Error saving MIDI: ${error}`);
        } finally {
          saveMidiBtn.disabled = false;
          saveMidiBtn.textContent = 'Save MIDI';
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
          await this.onWavSaved?.(path);

          new Notice(`WAV saved to ${path}`);
        } catch (error) {
          new Notice(`Error saving WAV: ${error}`);
        } finally {
          saveWavBtn.disabled = false;
          saveWavBtn.textContent = 'Save WAV';
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
      id: 'edit-selected-segment',
      name: 'Edit selected segment',
      editorCallback: (editor, view) => {
        const selection = editor.getSelection();
        const modal = new TextPromptModal(this.app, 'Editar seleção', selection, async (value: string) => {
          if (selection.length > 0) {
            editor.replaceSelection(value);
          } else {
            const cursor = editor.getCursor();
            editor.replaceRange(value, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: editor.getLine(cursor.line).length });
          }
          new Notice('Segment edited.');
        });
        modal.open();
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
          const result = convertDiatonicTabToChromatic(selection);
          editor.replaceSelection(result.text);
          const ignored = result.unknown > 0 ? `, ${result.unknown} not recognized` : '';
          new Notice(`Tab converted: ${result.converted} note(s)${ignored}.`);
          return;
        }

        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line) || '';
        const result = convertDiatonicTabToChromatic(line);
        editor.setLine(cursor.line, result.text);
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
          const result = convertChromaticTabToDiatonic(selection);
          editor.replaceSelection(result.text);
          const ignored = result.unknown > 0 ? `, ${result.unknown} not recognized` : '';
          new Notice(`Tab converted: ${result.converted} note(s)${ignored}.`);
          return;
        }

        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line) || '';
        const result = convertChromaticTabToDiatonic(line);
        editor.setLine(cursor.line, result.text);
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
          const result = convertABCToChromaticTab(selection);
          editor.replaceSelection(result.text);
          const ignored = result.unknown > 0 ? `, ${result.unknown} not recognized` : '';
          new Notice(`ABC converted to chromatic tab: ${result.converted} note(s)${ignored}.`);
          return;
        }

        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line) || '';
        const result = convertABCToChromaticTab(line);
        editor.setLine(cursor.line, result.text);
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

        if (!abcText || abcText.length === 0) {
          const cursor = editor.getCursor();
          abcText = editor.getLine(cursor.line) || '';
        }

        if (!abcText.trim()) {
          new Notice('Select or place cursor on a line with ABC notation');
          return;
        }

        const modal = new ABCViewerModal(this.app, abcText, this.settings.soundOutputFolder, getMidiProgram(this.settings), (path) => {
          const cursor = editor.getCursor();
          const line = editor.getLine(cursor.line) || '';
          editor.replaceRange(`\n![[${path}]]`, { line: cursor.line, ch: line.length });
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
    this.settings.midiProgram = getMidiProgram(this.settings);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

function getSoundOutputFolder(folderPath: string): string {
  return normalizePath(folderPath.trim() || DEFAULT_SOUND_OUTPUT_FOLDER);
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
      .setDesc('Vault folder where WAV and MIDI files are saved.')
      .addText((text) => text
        .setPlaceholder(DEFAULT_SOUND_OUTPUT_FOLDER)
        .setValue(this.plugin.settings.soundOutputFolder)
        .onChange(async (value) => {
          this.plugin.settings.soundOutputFolder = getSoundOutputFolder(value);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('MIDI instrument')
      .setDesc('Instrument used when generating MIDI and WAV files.')
      .addDropdown((dropdown) => dropdown
        .addOptions(MIDI_INSTRUMENT_OPTIONS)
        .setValue(String(getMidiProgram(this.plugin.settings)))
        .onChange(async (value) => {
          this.plugin.settings.midiProgram = Number(value);
          await this.plugin.saveSettings();
        }));
  }
}

class TextPromptModal extends Modal {
  inputEl!: HTMLTextAreaElement;
  titleText: string;
  initialValue: string;
  onSubmit: (value: string) => void;

  constructor(app: App, titleText: string, initialValue: string, onSubmit: (value: string) => void) {
    super(app);
    this.titleText = titleText;
    this.initialValue = initialValue;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: this.titleText });
    this.inputEl = contentEl.createEl('textarea') as HTMLTextAreaElement;
    this.inputEl.style.width = '100%';
    this.inputEl.style.minHeight = '120px';
    this.inputEl.value = this.initialValue || '';

    const btnRow = contentEl.createDiv({ cls: 'modal-button-row' });
const saveBtn = btnRow.createEl('button', { text: 'Save' }) as HTMLButtonElement;
      const cancelBtn = btnRow.createEl('button', { text: 'Cancel' }) as HTMLButtonElement;

    saveBtn.onclick = () => {
      this.onSubmit(this.inputEl.value);
      this.close();
    };

    cancelBtn.onclick = () => {
      this.close();
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

