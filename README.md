# Inline Code Copy

This plugin lets you copy the contents of an inline code span with a single click.

Inspired by https://github.com/ozavodny/obsidian-copy-inline-code-plugin

### Why this plugin?

I often store credentials and account details in Obsidian, and copying them requires selecting the text and pressing Ctrl + C—which isn’t as convenient as a single click. So, I created this plugin to make copying effortless!

## Features

- **One-click copy** of any inline code (`` `like this` ``) straight to the clipboard, with a notice confirming the result.
- **Works in both views** — copy from Reading View and from Editing View (Live Preview). Each can be enabled or disabled independently.
- **Configurable trigger** — choose the modifier key (none, Ctrl/Cmd, Shift, or Alt/Option) and the mouse button (left, middle, or right) that performs the copy, set separately for each view.
- **[Code Styler](https://github.com/mayurankv/Obsidian-Code-Styler) compatible** — an optional setting strips a leading `{…}` prefix (such as a Code Styler language tag) so only the real code lands on the clipboard.

## Development

- Clone this repo.
- Make sure your NodeJS is at least v16 (`node --version`).
- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.

## Manually installing the plugin

- Copy over `main.js` and `manifest.json` to your vault `VaultFolder/.obsidian/plugins/inline-code-copy/`.
