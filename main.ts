import { App, Notice, Platform, Plugin, PluginSettingTab, Setting } from "obsidian";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

type TriggerModifier = "none" | "ctrl" | "shift" | "alt";
type TriggerButton = "left" | "middle" | "right";

interface TriggerConfig {
	modifier: TriggerModifier;
	button: TriggerButton;
}

interface InlineCodeCopySettings {
	stripPrefix: boolean;
	enableReadingMode: boolean;
	enableLivePreview: boolean;
	readingTrigger: TriggerConfig;
	livePreviewTrigger: TriggerConfig;
}

const DEFAULT_SETTINGS: InlineCodeCopySettings = {
	stripPrefix: true,
	enableReadingMode: true,
	enableLivePreview: false,
	readingTrigger: { modifier: "none", button: "left" },
	livePreviewTrigger: { modifier: "none", button: "left" },
};

// On mobile there is no mouse, so every trigger collapses to a plain tap in reading view.
const MOBILE_TAP_TRIGGER: TriggerConfig = { modifier: "none", button: "left" };

const MODIFIER_OPTIONS: Record<TriggerModifier, string> = {
	none: "No modifier",
	ctrl: "Ctrl / Cmd",
	shift: "Shift",
	alt: "Alt / Option",
};

const BUTTON_OPTIONS: Record<TriggerButton, string> = {
	left: "Left click",
	middle: "Middle click",
	right: "Right click",
};

function modifierMatches(e: MouseEvent, modifier: TriggerModifier): boolean {
	// Treat the macOS Cmd key as an equivalent to Ctrl.
	const ctrl = e.ctrlKey || e.metaKey;
	const shift = e.shiftKey;
	const alt = e.altKey;
	switch (modifier) {
		case "none":
			return !ctrl && !shift && !alt;
		case "ctrl":
			return ctrl && !shift && !alt;
		case "shift":
			return shift && !ctrl && !alt;
		case "alt":
			return alt && !ctrl && !shift;
		default:
			return false;
	}
}

function buttonMatches(e: MouseEvent, button: TriggerButton): boolean {
	const expected = button === "left" ? 0 : button === "middle" ? 1 : 2;
	return e.button === expected;
}

function triggerMatches(e: MouseEvent, trigger: TriggerConfig): boolean {
	return buttonMatches(e, trigger.button) && modifierMatches(e, trigger.modifier);
}

function stripLeadingPrefix(text: string): string {
	return text.replace(/^\{[^}]*\}\s*/, "");
}

async function copyToClipboard(text: string): Promise<boolean> {
	// Preferred path: the async Clipboard API. It can be missing or throw in
	// insecure/edge contexts, so guard it and fall back rather than assume success.
	try {
		if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch (e) {
		// fall through to the legacy fallback below
	}

	// Fallback: a hidden textarea + execCommand("copy").
	try {
		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.style.position = "fixed";
		textarea.style.top = "-9999px";
		textarea.style.left = "-9999px";
		document.body.appendChild(textarea);
		textarea.focus();
		textarea.select();
		const ok = document.execCommand("copy");
		textarea.remove();
		return ok;
	} catch (e) {
		return false;
	}
}

export default class InlineCodeCopyPlugin extends Plugin {
	settings: InlineCodeCopySettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new InlineCodeCopySettingTab(this.app, this));

		// Reading view (and other rendered-markdown contexts): a single delegated
		// listener on the document instead of one listener per <code> element.
		this.registerDomEvent(document, "mousedown", (e) => this.handleReadingPointerDown(e));
		this.registerDomEvent(document, "contextmenu", (e) => this.handleReadingContextMenu(e));

		// Live Preview / source mode: inline code is rendered by CodeMirror rather
		// than as <code> elements, so it needs a dedicated editor event handler.
		this.registerEditorExtension(
			EditorView.domEventHandlers({
				mousedown: (event, view) => this.handleEditorPointerDown(event, view),
				contextmenu: (event, view) => this.handleEditorContextMenu(event, view),
			})
		);
	}

	onunload() {}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = {
			...DEFAULT_SETTINGS,
			...data,
			// Merge nested objects explicitly so old data (or partial data) keeps the
			// defaults for any missing field, without sharing the DEFAULT_SETTINGS refs.
			readingTrigger: { ...DEFAULT_SETTINGS.readingTrigger, ...(data?.readingTrigger ?? {}) },
			livePreviewTrigger: {
				...DEFAULT_SETTINGS.livePreviewTrigger,
				...(data?.livePreviewTrigger ?? {}),
			},
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private handleReadingPointerDown(e: MouseEvent): void {
		// On mobile, ignore the (hidden) trigger settings and always fall back to a
		// plain tap-to-copy in reading view.
		const trigger = Platform.isMobile ? MOBILE_TAP_TRIGGER : this.settings.readingTrigger;
		if (!Platform.isMobile && !this.settings.enableReadingMode) return;
		if (!triggerMatches(e, trigger)) return;
		const code = this.getRenderedInlineCode(e.target);
		if (!code) return;
		const text = code.textContent;
		if (!text) return;
		// Middle-click would otherwise start autoscroll; suppress it.
		if (trigger.button === "middle") e.preventDefault();
		this.copyAndNotify(text);
	}

	private handleReadingContextMenu(e: MouseEvent): void {
		// Mobile uses plain tap-to-copy, so leave the long-press context menu alone.
		if (Platform.isMobile) return;
		// Only suppress the context menu when reading-view copying is enabled,
		// right-click is the configured trigger, and the click landed on inline code.
		if (!this.settings.enableReadingMode) return;
		if (this.settings.readingTrigger.button !== "right") return;
		if (this.getRenderedInlineCode(e.target)) e.preventDefault();
	}

	private getRenderedInlineCode(target: EventTarget | null): HTMLElement | null {
		if (!(target instanceof HTMLElement)) return null;
		const code = target.closest("code");
		if (!(code instanceof HTMLElement)) return null;
		if (code.closest("pre")) return null; // fenced/block code, not inline
		// Scope to rendered markdown so we don't hijack <code> elements in the app UI.
		if (!code.closest(".markdown-preview-view, .markdown-rendered")) return null;
		return code;
	}

	private handleEditorPointerDown(event: MouseEvent, view: EditorView): boolean {
		// Editing-view copying is desktop-only; mobile falls back to reading view.
		if (Platform.isMobile) return false;
		if (!this.settings.enableLivePreview) return false;
		const trigger = this.settings.livePreviewTrigger;
		if (!triggerMatches(event, trigger)) return false;
		const code = this.getEditorInlineCode(event, view);
		if (code === null) return false;
		if (trigger.button === "middle") event.preventDefault();
		this.copyAndNotify(code);
		return false; // don't consume the event; let normal editing proceed
	}

	private handleEditorContextMenu(event: MouseEvent, view: EditorView): boolean {
		if (Platform.isMobile) return false;
		if (!this.settings.enableLivePreview) return false;
		if (this.settings.livePreviewTrigger.button !== "right") return false;
		if (this.getEditorInlineCode(event, view) !== null) {
			event.preventDefault();
			return true; // suppress the editor context menu
		}
		return false;
	}

	private getEditorInlineCode(event: MouseEvent, view: EditorView): string | null {
		const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
		if (pos === null) return null;
		const tree = syntaxTree(view.state);
		const docLength = view.state.doc.length;
		// Probe around the hit position so clicks near a token edge still resolve.
		for (const probe of [pos, pos - 1, pos + 1]) {
			if (probe < 0 || probe > docLength) continue;
			const node = tree.resolveInner(probe, 1);
			const name = node.type.name;
			if (name.includes("inline-code") && !name.includes("formatting")) {
				return view.state.sliceDoc(node.from, node.to);
			}
		}
		return null;
	}

	private copyAndNotify(rawText: string): void {
		const text = this.settings.stripPrefix ? stripLeadingPrefix(rawText) : rawText;
		copyToClipboard(text).then((ok) => {
			new Notice(ok ? "Text copied to clipboard!" : "Failed to copy text to clipboard.");
		});
	}
}

class InlineCodeCopySettingTab extends PluginSettingTab {
	plugin: InlineCodeCopyPlugin;

	constructor(app: App, plugin: InlineCodeCopyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Strip leading {…} prefix")
			.setDesc(
				"Remove a leading {…} group (e.g. a Code Styler language prefix) from inline code before copying it to the clipboard."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.stripPrefix).onChange(async (value) => {
					this.plugin.settings.stripPrefix = value;
					await this.plugin.saveSettings();
				})
			);

		if (Platform.isMobile) {
			// No mouse on mobile: expose only the prefix option, and briefly note why.
			containerEl.createEl("p", {
				text: "Tap to copy in Reading View; more options not available on mobile.",
				cls: "setting-item-description",
			});
			return;
		}

		new Setting(containerEl).setName("Reading View").setHeading();
		new Setting(containerEl)
			.setName("Enable in Reading View")
			.setDesc("Allow inline code to be copied by clicking it in Reading View.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableReadingMode).onChange(async (value) => {
					this.plugin.settings.enableReadingMode = value;
					await this.plugin.saveSettings();
				})
			);
		this.addTriggerSettings(containerEl, this.plugin.settings.readingTrigger);

		new Setting(containerEl).setName("Editing View").setHeading();
		new Setting(containerEl)
			.setName("Enable in Live Preview")
			.setDesc("Allow inline code to be copied by clicking it in Live Preview.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableLivePreview).onChange(async (value) => {
					this.plugin.settings.enableLivePreview = value;
					await this.plugin.saveSettings();
				})
			);
		this.addTriggerSettings(containerEl, this.plugin.settings.livePreviewTrigger);
	}

	private addTriggerSettings(containerEl: HTMLElement, trigger: TriggerConfig): void {
		new Setting(containerEl)
			.setName("Modifier key")
			.setDesc("Hold this key while clicking to trigger the copy.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(MODIFIER_OPTIONS)
					.setValue(trigger.modifier)
					.onChange(async (value) => {
						trigger.modifier = value as TriggerModifier;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Mouse button")
			.setDesc("The mouse button that triggers the copy.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(BUTTON_OPTIONS)
					.setValue(trigger.button)
					.onChange(async (value) => {
						trigger.button = value as TriggerButton;
						await this.plugin.saveSettings();
					})
			);
	}
}
