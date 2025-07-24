import { Notice, Plugin } from "obsidian";

export default class InlineCodeCopyPlugin extends Plugin {
	async onload() {
		this.registerMarkdownPostProcessor((el) => {
			const codes = el.querySelectorAll("*:not(pre) > code");
			codes.forEach((code) => {
				const text = code.textContent;
				code.addEventListener("click", (e) => {
					if (text) {
						// e.stopPropagation();
						const textunprefixed = text.replace(/^\{[^}]*\}\s*/, "");
						navigator.clipboard.writeText(textunprefixed);
						new Notice("Text copied to clipboard!");
					}
				});
			});
		});
	}

	onunload() {}
}
