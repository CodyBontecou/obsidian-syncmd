import { App, Notice, Platform, Plugin, PluginSettingTab, Setting } from "obsidian";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

interface SyncMdSettings {
	defaultCommitMessage: string;
	showRibbonIcon: boolean;
}

const DEFAULT_SETTINGS: SyncMdSettings = {
	defaultCommitMessage: "vault backup: {{date}}",
	showRibbonIcon: true,
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default class SyncMdPlugin extends Plugin {
	settings: SyncMdSettings = DEFAULT_SETTINGS;

	/** Tracks whether we're waiting for a callback from Sync.md. */
	private pendingAction: string | null = null;

	/** Safety timeout so the "waiting" state doesn't hang forever. */
	private timeoutId: number | null = null;

	// -----------------------------------------------------------------------
	// Lifecycle
	// -----------------------------------------------------------------------

	async onload() {
		await this.loadSettings();

		// -- Protocol handler: receives callbacks from Sync.md ---------------
		//    URL format: obsidian://syncmd-result?action=pull&status=ok&sha=...
		this.registerObsidianProtocolHandler("syncmd-result", (params) => {
			this.handleCallback(params);
		});

		// -- Commands --------------------------------------------------------
		this.addCommand({
			id: "syncmd-pull",
			name: "Pull changes from GitHub",
			callback: () => this.executePull(),
		});

		this.addCommand({
			id: "syncmd-push",
			name: "Push changes to GitHub",
			callback: () => this.executePush(),
		});

		this.addCommand({
			id: "syncmd-sync",
			name: "Sync (pull then push)",
			callback: () => this.executeSync(),
		});

		this.addCommand({
			id: "syncmd-status",
			name: "Show repository status",
			callback: () => this.executeStatus(),
		});

		// -- Ribbon icon -----------------------------------------------------
		if (this.settings.showRibbonIcon) {
			this.addRibbonIcon("refresh-cw", "Sync with GitHub (Sync.md)", () => {
				this.executeSync();
			});
		}

		// -- Settings tab ----------------------------------------------------
		this.addSettingTab(new SyncMdSettingTab(this.app, this));
	}

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	/**
	 * The vault folder name is the shared identifier between
	 * the Obsidian vault and Sync.md's `RepoConfig.vaultFolderName`.
	 */
	private getRepoName(): string {
		return this.app.vault.getName();
	}

	/** Expand template tokens in the commit message. */
	private formatCommitMessage(): string {
		const now = new Date();
		return this.settings.defaultCommitMessage
			.replace("{{date}}", now.toISOString().split("T")[0])
			.replace("{{datetime}}", now.toISOString());
	}

	/**
	 * Build and open a `syncmd://x-callback-url/<action>` URL.
	 *
	 * On iOS this triggers an app-switch to Sync.md which performs the
	 * requested git operation and redirects back to Obsidian via the
	 * `obsidian://syncmd-result` protocol handler.
	 */
	private openSyncMd(action: string, extra: Record<string, string> = {}) {
		if (!Platform.isMobile) {
			new Notice(
				"Sync.md sync is only available on iOS. Use git on desktop.",
				5000,
			);
			return;
		}

		const params = new URLSearchParams({
			repo: this.getRepoName(),
			"x-success": "obsidian://syncmd-result",
			"x-error": "obsidian://syncmd-result",
			...extra,
		});

		const url = `syncmd://x-callback-url/${action}?${params.toString()}`;

		this.pendingAction = action;

		// If we don't hear back in 30 s the app probably isn't installed.
		this.timeoutId = window.setTimeout(() => {
			if (this.pendingAction) {
				new Notice(
					"⚠️ No response from Sync.md. Is the app installed?",
					5000,
				);
				this.pendingAction = null;
			}
		}, 30_000);

		// Open Sync.md via the custom URL scheme.
		// On iOS this triggers an app switch.
		window.open(url);
	}

	// -----------------------------------------------------------------------
	// Actions
	// -----------------------------------------------------------------------

	private executePull() {
		new Notice("⏳ Opening Sync.md to pull…");
		this.openSyncMd("pull");
	}

	private executePush() {
		new Notice("⏳ Opening Sync.md to push…");
		this.openSyncMd("push", {
			message: this.formatCommitMessage(),
		});
	}

	private executeSync() {
		new Notice("⏳ Opening Sync.md to sync…");
		this.openSyncMd("sync", {
			message: this.formatCommitMessage(),
		});
	}

	private executeStatus() {
		new Notice("⏳ Checking repository status…");
		this.openSyncMd("status");
	}

	// -----------------------------------------------------------------------
	// Callback handler
	// -----------------------------------------------------------------------

	/**
	 * Called when Obsidian opens `obsidian://syncmd-result?…`.
	 * Sync.md appends action-specific query parameters.
	 */
	private handleCallback(params: Record<string, string>) {
		// Clear timeout
		if (this.timeoutId !== null) {
			window.clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}
		this.pendingAction = null;

		const action = params["action"] ?? "unknown";
		const status = params["status"];

		if (status === "ok") {
			this.handleSuccess(action, params);
		} else {
			const message = params["message"] ?? "Unknown error";
			new Notice(`❌ ${action} failed: ${message}`, 6000);
		}
	}

	private handleSuccess(action: string, params: Record<string, string>) {
		const sha = params["sha"]
			? ` (${params["sha"].substring(0, 7)})`
			: "";

		switch (action) {
			case "pull": {
				const updated = params["updated"] === "true";
				if (updated) {
					new Notice(`✅ Pull complete${sha}`, 4000);
				} else {
					new Notice("✅ Already up to date", 3000);
				}
				break;
			}

			case "push":
				new Notice(`✅ Push complete${sha}`, 4000);
				break;

			case "sync": {
				const skipped = params["push_skipped"] === "true";
				if (skipped) {
					new Notice(
						`✅ Synced — no local changes to push${sha}`,
						4000,
					);
				} else {
					new Notice(`✅ Sync complete${sha}`, 4000);
				}
				break;
			}

			case "status": {
				const branch = params["branch"] ?? "?";
				const changes = params["changes"] ?? "0";
				new Notice(
					`📊 Branch: ${branch} · Changes: ${changes}${sha}`,
					6000,
				);
				break;
			}

			default:
				new Notice(`✅ ${action} complete${sha}`, 3000);
		}
	}

	// -----------------------------------------------------------------------
	// Settings persistence
	// -----------------------------------------------------------------------

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

class SyncMdSettingTab extends PluginSettingTab {
	plugin: SyncMdPlugin;

	constructor(app: App, plugin: SyncMdPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Header
		containerEl.createEl("h2", { text: "Sync.md – Git Sync" });

		containerEl.createEl("p", {
			text:
				"Sync your vault with GitHub through the Sync.md iOS app. " +
				"Make sure Sync.md is installed and this vault is configured there.",
			cls: "setting-item-description",
		});

		// Commit message
		new Setting(containerEl)
			.setName("Default commit message")
			.setDesc("Use {{date}} for YYYY-MM-DD, {{datetime}} for ISO timestamp")
			.addText((text) =>
				text
					.setPlaceholder("vault backup: {{date}}")
					.setValue(this.plugin.settings.defaultCommitMessage)
					.onChange(async (value) => {
						this.plugin.settings.defaultCommitMessage = value;
						await this.plugin.saveSettings();
					}),
			);

		// Ribbon icon toggle
		new Setting(containerEl)
			.setName("Show ribbon icon")
			.setDesc("Show a sync button in the left sidebar (reload required)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showRibbonIcon)
					.onChange(async (value) => {
						this.plugin.settings.showRibbonIcon = value;
						await this.plugin.saveSettings();
						new Notice("Reload Obsidian to apply ribbon icon change");
					}),
			);

		// Info
		containerEl.createEl("h3", { text: "How it works" });

		const info = containerEl.createEl("div");
		info.createEl("p", {
			text: "When you run a sync command this plugin:",
		});

		const list = info.createEl("ol");
		list.createEl("li", {
			text: "Opens Sync.md via its URL scheme with the requested action",
		});
		list.createEl("li", {
			text: "Sync.md performs the git operation (pull / push / sync)",
		});
		list.createEl("li", {
			text: "Sync.md redirects back to Obsidian with the result",
		});

		const vaultName = this.plugin.app.vault.getName();
		const note = info.createEl("p");
		note.createEl("strong", { text: "Vault name: " });
		note.createEl("code", { text: vaultName });

		info.createEl("p", {
			text:
				"This vault name must match the repository's folder name in Sync.md. " +
				"If they don't match, open Sync.md and verify the vault folder name.",
		});
	}
}
