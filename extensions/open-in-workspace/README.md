# Open in Workspace — Hermes WebUI Extension

Adds two workspace-navigation features:

## 1. "Open in workspace" button on `read_file` tool cards

Each read_file tool card gets a small folder-open button. Click it to reveal the file in the workspace file-tree panel — same as clicking an artifact link.

## 2. Numbered file-change chips on assistant message footers

When the agent modifies files in a turn (via `write_file`, `patch`, or `read_file`), small numbered pill buttons appear on the right side of the message footer (`.msg-foot`).

- Each file gets a number (1, 2, 3…) in order of first appearance
- Hover reveals the filename
- Click opens the file in the workspace panel
- Deduplicated — the same file written and then patched shows as one button

## How it works

- Uses `MutationObserver` on the chat container to detect new `.assistant-turn` elements
- Scans all tool cards within a turn for file paths from `_tcData.args`
- Injects buttons into the turn's last `.msg-foot`

## Install

From **Settings → Extensions → Gallery**, find **Open in Workspace** and click Install.

Or manually:

```bash
# Clone or copy the extension files, then:
export HERMES_WEBUI_EXTENSION_DIR=/path/to/open-in-workspace
export HERMES_WEBUI_EXTENSION_MANIFEST=manifest.json
./start.sh
```
