# Chat Tiling — snapshot-only v1

Compare saved conversation history in 2, 4 or 6 snapshot cards. There is only
one input area: Core's existing composer, shown in normal chat. Every grid cell
is a history snapshot; none is a transparent live pane.

Click **Compare history** to open the grid. Its first empty slot loads the
current conversation's recent saved history. Click sidebar conversation titles
to add more snapshots. On narrow screens the cards stack vertically. Each card
has **Refresh history**, **Expand**, and **Close** controls. Refresh reads saved
history again; it does not subscribe to a stream. Responses are limited to the
most recent 30 visible rows. Open normal chat to read the full conversation.

Click a card's title to leave the grid and use Core's ordinary `loadSession`
navigation. Core owns the draft, attachments, profile/model, approvals, sends
and streams. Use **Compare history** again to return to the retained snapshots,
or **Return to chat** / Escape to leave comparison without navigating.

**Close only removes a local snapshot.** It does not cancel a stream, delete a
conversation, clear a draft or change Core's active session. Closing the final
card returns to normal chat. Reducing a layout refuses to silently discard
populated cards; close them first. Failed refreshes keep the previous snapshot.

The grid temporarily hides and makes Core's transcript/composer inert while
comparison is visible; it never detaches them or creates a second composer.
Their previous accessibility attributes are restored on exit. Owned controls
stop Enter/Space propagation so grid actions cannot trigger Core's approval
shortcut. Sidebar action buttons and menus remain Core's responsibility.
Switching panels exits comparison. Native navigation is never vetoed by a
session-open hook; it exits the grid and proceeds normally. Native new/delete
transitions that bypass those hooks are observed to exit comparison, without
trying to repair, supersede or roll back Core's navigation.

## Trust and capabilities

Same-origin read-only `/api/session` requests supply snapshot history. The
extension uses Core's `renderTranscript` renderer and public `loadSession` and
session-open hook. It does not write storage, drafts or inflight state; does not
read `INFLIGHT`; and does not call send, approval, cancel or delete APIs. No
sidecar, filesystem access, remote scripts or external service is required.
Both manifests declare no write endpoints and no shared storage keys.

Core normal navigation may still fail, including during streaming recovery.
The extension hands off once, restores normal chat and never performs a failed
load rollback or writes composer state. A resolved Core navigation promise is
not presented as a successful live snapshot. Core's own failed-navigation draft
and attachment behavior remains a Core concern; this extension does not claim
to repair it. Fitted live-pane geometry and stream-owned cancellation are not
requirements of this snapshot-only version.

## Verification

```bash
node scripts/test-chat-tiling.mjs
HERMES_CORE_DIR=/path/to/hermes-webui python tests/compatibility/chat_tiling_smoke.py
```

The browser suite uses a real isolated Core backend, real imported transcripts,
and the native renderer/navigation. It checks populated desktop, narrow/mobile,
light/dark snapshots, the sole composer and node restoration, keyboard actions,
returning to retained snapshots, independent snapshot refresh failures and late
responses, local close of busy history, persisted draft isolation, and failure
handoff without extension rollback. Approval responses and unexpected browser
egress are blocked; no actual model or cancel/delete producer is invoked.
The removed live-tile regression evidence remains in the maintenance outcome
report; it is not treated as this product's acceptance contract.

## Local testing

```bash
cd /path/to/hermes-webui
HERMES_WEBUI_EXTENSION_DIR=/path/to/hermes-webui-extensions/extensions/chat-tiling \
HERMES_WEBUI_EXTENSION_MANIFEST=manifest.json \
./start.sh
```

Requires Core's public session-open hook, transcript renderer and `loadSession`.
Feature detection leaves unsupported Core versions unchanged. No live-tile mode
or automatic stream cancellation is included in v1.
