# Sync.md – Git Sync for Obsidian

An Obsidian plugin that syncs your vault with GitHub through the [Sync.md](https://github.com/codybontecou/Sync.md) iOS app.

## How It Works

This plugin communicates with Sync.md using the [x-callback-url](http://x-callback-url.com/) protocol:

1. You trigger a command (pull / push / sync) from the Obsidian command palette or ribbon icon
2. Obsidian opens Sync.md via its `syncmd://` URL scheme
3. Sync.md performs the git operation using libgit2
4. Sync.md redirects back to Obsidian with the result via `obsidian://syncmd-result`
5. The plugin shows a notification with the outcome

The round-trip takes ~2-4 seconds including both app switches.

## Prerequisites

- **Sync.md** installed on your iOS device
- A repository already cloned in Sync.md
- The vault folder name in Obsidian must match the vault folder name in Sync.md

## Commands

| Command | Description |
|---------|-------------|
| **Pull changes from GitHub** | Fetch and fast-forward to the latest remote commit |
| **Push changes to GitHub** | Stage all changes, commit, and push |
| **Sync (pull then push)** | Pull first, then push local changes |
| **Show repository status** | Display branch, commit SHA, and uncommitted change count |

## Settings

- **Default commit message** — Template for push commits. Supports `{{date}}` (YYYY-MM-DD) and `{{datetime}}` (ISO timestamp)
- **Show ribbon icon** — Toggle the sync button in the left sidebar

## Installation

### Manual

1. Build the plugin:
   ```bash
   cd obsidian-plugin
   npm install
   npm run build
   ```
2. Copy `main.js`, `manifest.json`, and `styles.css` into your vault at `.obsidian/plugins/syncmd-git-sync/`
3. Enable the plugin in Obsidian → Settings → Community Plugins

## URL Schema Reference

### Obsidian → Sync.md

```
syncmd://x-callback-url/<action>?repo=<name>&x-success=obsidian://syncmd-result&x-error=obsidian://syncmd-result
```

**Actions:** `pull`, `push`, `sync`, `status`

**Parameters:**
- `repo` — Vault folder name (must match `RepoConfig.vaultFolderName` in Sync.md)
- `message` — Commit message (for push/sync)
- `x-success` — Callback URL on success
- `x-error` — Callback URL on failure

### Sync.md → Obsidian

```
obsidian://syncmd-result?action=<action>&status=ok&sha=<commitSHA>&...
```

**Common response parameters:**
- `action` — The action that was performed
- `status` — `ok` or `error`
- `message` — Error message (when status is `error`)

**Pull:** `sha`, `updated` (true/false)

**Push:** `sha`

**Sync:** `sha`, `pull_updated`, `push_skipped`

**Status:** `branch`, `sha`, `changes`
