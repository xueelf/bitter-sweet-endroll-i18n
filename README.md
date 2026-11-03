# Bitter Sweet Endroll i18n

An unofficial multilingual patch for the game [ビタースイートエンドロール ～Bitter Sweets／The End～](https://www.dlsite.com/aix/work/=/product_id/RJ01685413.html), which adds a multilingual menu to the program's "Settings" interface, allowing any language to be switched at any time in-game.

A Chinese translation is currently provided, proofread by the AI model DeepSeek V4.1 Flash Max. As a friendly note, because some of the text is entirely processed by AI, some lines may contain particularly awkward content.

Read this in other languages: English | [中文](./README.zh.md) | [日本語](./README.ja.md)

## Download

Download the installer from [GitHub Releases](https://github.com/xueelf/bitter-sweet-endroll-i18n/releases/latest):

- `BitterSweetEndroll-i18n.exe`

## Usage

1. Exit the game completely.
2. Place `BitterSweetEndroll-i18n.exe` in the game root, next to the `Data` folder.
3. Double-click the exe and select a number:

```text
1) Install/Update
2) Uninstall
3) Exit
```

During installation the game's original `Data/resources/app.asar` is backed up as `Data/resources/base.asar`. Uninstalling restores the original, and deletes the backup.

The program interface language follows the Windows system language, for example it displays Chinese when the system is Chinese, and Japanese when the system is Japanese. When the system language has no corresponding multilingual text (no translation text exists in the locales folder), Japanese is displayed by default.

## Development

The patch is built with Bun and .NET 8 SDK:

```bash
# Scan game text, and sync it into locale files
bun run extract -- --game "<unpacked directory>"
# Build the patch (requires the game)
bun run build -- --game "<game root or Data directory>"
# Build the installer (requires .NET 8 SDK)
bun run installer
```

Translations are stored under `locales/<language code>/`, with paths corresponding one-to-one to the game's original files. Untranslated entries are marked as `null`, and the original text is displayed in-game:

```json
{
  "設定": "设置",
  "終了": null
}
```

The basic language information can be declared in `locales/<language code>/index.js`:

```js
export default {
  // Name displayed in the "Settings" list
  label: 'English',
  messages: {
    // Title of the language menu row in the "Settings" interface
    language: 'Language',
    // Text on the startup screen
    startup: 'Starting…',
  },
};
```

## Notice

The patch modifies game scripts, the exe icon uses assets from the game, and all rights belong to their respective owners. This project is for learning purposes only, so please do not promote or abuse it. Please support the official release.
