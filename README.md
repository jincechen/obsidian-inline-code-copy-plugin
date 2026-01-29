# Inline Code Copy

This plugin lets you quickly copy the content of inline code blocks with a simple click in reading view.

Inspired by https://github.com/ozavodny/obsidian-copy-inline-code-plugin

### Why this plugin?

I often store credentials and account details in Obsidian, and copying them requires selecting the text and pressing Ctrl + C—which isn’t as convenient as a single click. So, I created this plugin to make copying effortless!

## How to use

- Clone this repo.
- Make sure your NodeJS is at least v16 (`node --version`).
- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

\* This plugin is compatible with [Code Styler](https://github.com/mayurankv/Obsidian-Code-Styler) inline prefix by removing any leading `{...}` group. If this behaviour isn't desired, you can safely remove the replace method in `main.ts`.
