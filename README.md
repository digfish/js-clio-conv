# Obsidian Clio Conv

Clio Conv is a plugin for harmonica players that use the tabs from harptabs.com. Plugin to manage harmonica tabs and text-formatted music sheets in Obsidian. It allows you to easily convert the tabs into a format that can be used in Obsidian, making it easier to organize and access your music sheets.

## How to use

1. Run `npm install` in the plugin directory.
2. Run `npm run build` to generate `main.js`.
3. Copy the plugin folder to `vault/.obsidian/plugins/obsidian-clio-conv` or use development mode.
4. Enable the plugin in Obsidian settings.

## Commands and features

- Command palette commands for text editing and notation conversion.
- Convert selected text or current line from diatonic/chromatic tab notation.
- Convert selected tab to ABC notation and render ABC scores.
- Export score in ABC to SVG or PNG image
- Generate MIDI or WAV audio files

## Development

- `npm run dev` - watch for changes and rebuild automatically.
- `npm run build` - compile the plugin for production.
