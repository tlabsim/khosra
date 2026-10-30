# Khosra · খসড়া

Khosra is a private manuscript workspace designed to be hosted on your own domain and connected to chat models such as ChatGPT. Develop a book through text conversations or, where the connected client supports tool access in voice mode, spoken discussions. Khosra keeps the source manuscript, feedback, proposed rewrites and revision history available between conversations.

Discuss a scene, ask for a different direction, review the saved proposal in Khosra, then continue the next conversation from the accepted revision. You remain in control of every manuscript change.

The hosted application exposes authenticated **Model Context Protocol (MCP)** tools so a connected model can retrieve source passages and save proposals. Voice conversation and transcription belong to the chat client; Khosra handles manuscript storage, reading, editing and review. It makes no model or speech-to-text API calls and needs no provider API key. The current workflow is designed for ChatGPT; other MCP clients and voice-mode tool availability require verification in the intended client.

**Start here:** [Host Khosra](#deploy-upload-extract-and-configure), then [connect and iterate through chat](#iterate-through-text-or-voice-chat). Desktop and mobile editing remain local-first, with offline access after the application has loaded.

## Objective and goals

Khosra gives authors a reliable source of truth outside a chat conversation. Its goals are to:

- Support a continuing manuscript-development conversation through text and voice, with the hosted manuscript available to connected models.
- Keep current prose, earlier drafts and approved revisions recoverable.
- Let a model retrieve exact source passages instead of relying on conversation memory.
- Turn model rewrites into reviewable proposals that require author acceptance.
- Preserve stable paragraph identities for feedback, references and historical recovery.
- Support Bengali and English writing, comfortable reading and private reader feedback.
- Run on ordinary PHP hosting with portable SQLite storage, optional MySQL support and local editing without a server connection.

Khosra is currently a **single-owner application**. Guest readers can read and comment on shared snapshots; simultaneous multi-author editing is outside the current scope.

## What you can do

| Area | Features |
| --- | --- |
| Organize | Multiple manuscripts, premises, outlines, chapter ordering, optional subsection headings and recoverable chapter Trash |
| Write | Direct paragraph editing, Word clipboard import, paragraph split/join, autosave and stable references |
| Review | Passage/chapter flags, continuous proposal review, editable suggestions, selective acceptance and confirmed decisions |
| Plan | Manuscript-wide Ideas with Idea/Planned/Used/Discarded status, optional chapter links, and immutable note versions |
| Reference | Private Artifacts: images, maps, PDFs, links and source notes, with version history and archive/restore |
| Recover | Immutable revision snapshots, deleted/cleared paragraph restoration, historical reading and full-history archives |
| Read | Continuous, single-page and two-page layouts; physical page proportions; 8–16pt type with a 14pt default; paper, margins, gestures, progress and fullscreen preferences |
| Collaborate | Authenticated MCP source/history retrieval, revision-linked proposals and evidence-linked chapter context |
| Share | Expiring, revocable guest reading links for a whole manuscript or selected chapters, with passage/chapter feedback |
| Export | Selected manuscript as Markdown text, or the entire local workspace and history as a validated archive |

## Everyday use

On desktop, **Contents** expands into additional columns when chapters no longer fit vertically, up to four as space permits. The list reads down each column, then across, and opens with the selected chapter visible. Very large lists scroll within the panel; mobile keeps one column.

### Iterate through text or voice chat

Hosting is the recommended setup for the full workflow: the chat client needs to reach Khosra’s authenticated HTTPS endpoint. Once configured:

1. Open your hosted Khosra site and sign in with the owner password. Every device signs in to the same server workspace.
2. If this browser already has a device-only manuscript, use **Continue with this device’s draft** to bring it online. If the server contains work too, review both versions first. Otherwise create or open a manuscript normally.
3. Connect your chat client to the authenticated MCP endpoint using OAuth. **Copy project instructions** in Settings provides the collaboration guidance.
4. Ask the model to call `get_khosra_guide`, then `list_books` and `read_chapter` for the intended manuscript and chapter. Discuss changes through text or supported voice conversation; the model saves a proposal against the exact source revision.
5. Incoming proposals refresh automatically while connected, roughly every 10 seconds or when returning to the app. **Sync now** checks immediately. Open **Proposals**; **Pending** is the default, with **All**, **Accepted** and **Rejected** filters; Accepted includes full and partial acceptances, distinguished by their card badges, newest first, at most 100 per page. **Review proposal** opens a single continuous manuscript view: blue modifications, green additions and red struck-through deletions, with up to five surrounding paragraphs and left-aligned dotted gaps. **Show current** expands the latest counterpart; **Edit** adjusts suggested wording. **Show deleted** controls visibility, not selection. Changes are checked under **Accept** by default. Uncheck individual edits to decline them; linked replacements/splits/joins and reordered proposals are selected together. Use **Accept all proposed changes**, **Accept selected**, or **Reject this proposal** from the card or fixed review footer, then confirm. Partial acceptance completes the review and declines unchecked changes. Overlapping selected edits require explicit resolution; unrelated author edits remain intact. Acceptance creates a new revision with stable references and an immutable review record; original proposal text and earlier manuscript versions remain recoverable. A draft change invalidates an open acceptance confirmation.
6. Wait for **Saved to server**, then continue the conversation. The model’s next source read and your other signed-in devices use that saved version.

**The server is the central workspace.** The production build requires sign-in and saves changes automatically. Each browser keeps a recovery/offline cache; pending offline edits are not yet visible to models or other devices. On reconnection, compatible changes combine safely and divergent edits pause for review with both histories retained. Version checks reject stale writes, retries use durable operation IDs, and no MCP tool can accept a proposal or directly overwrite the working manuscript.

Proposal submission retains the exact source revision read by the model. If the author saves while a proposal is being drafted, an earlier ancestor in the same reference edition remains valid: review preserves unrelated edits and requires explicit resolution for overlaps. Unknown sources, unrelated branches and changed reference editions require fresh source reconciliation.

For a finished chapter, open **History → Clean up chapter** to preview the workspace size reduction. Use the header’s Export backup action before a cleanup session. In each cleanup modal, check **I have made a backup**, then confirm permanent removal of reviewed proposal copies (including receipts and the accepted new-chapter suggestion) and older context indexes for that chapter. Current/approved text, all revision history, pending proposals, flags, latest context, ideas and artifacts remain. Hosted cleanup is available after **Saved to server**. Removed records are accessible only in the backup; cleanup receipts prevent older synced copies or restored archives from bringing them back. This reduces redundant proposal storage; it does not compact revision history or attachment bytes.

Existing-chapter rewrites should use **`save_proposal_edits`**: send the exact source revision, only replacement ranges and insertions, and `[]` for unused lists. Replacement endpoints are inclusive source paragraph UUIDs; an empty replacement deletes the range. Insertions use `after_paragraph_id` (`null` prepends). Text rows need only `text`, with optional `section`; the server preserves untouched paragraphs, retains replaced identities positionally and allocates new UUIDs/labels. Ranges cannot overlap and insertions cannot fall inside a replaced range. `save_proposal` also remains fully supported for whole-chapter rewrites, reordering and complete snapshots; new-chapter proposals still need the full draft. Differential requests still become full stored review snapshots, so this reduces transport size rather than workspace storage.

The 19 tools cover onboarding, book discovery, references, chapter reads, flags, proposals, history, context, ideas, artifacts and new-chapter suggestions. Context can become stale; source text remains authoritative. Saving a proposal does not mean the manuscript has changed. For a new chapter, use `save_chapter_proposal` with its title, synopsis, position and draft. Review it in **Proposals** and confirm **Create chapter**; this also works before the manuscript has any chapters.

For example: “Read chapter two and help me make the dialogue less formal,” “Compare this scene with the earlier revision,” or “Keep the ending, but propose a slower reveal.” Start by having the model retrieve the relevant source. Review saved proposals in Khosra before continuing from an accepted revision.

### Incremental workspace sync

After the initial download, routine saves send only changed record fields and new records. Revision snapshots and proposal/review paragraphs reuse their exact source revision and transfer changed paragraph rows, with explicit ordering only when needed. Unchanged polls return a version/fingerprint; changed downloads fetch only the affected records. The server still reconstructs and validates the complete workspace atomically, retaining all history and review safeguards. Gzip is used only when the actual request exceeds 20 MiB, regardless of total workspace size.

The first run after upgrading builds a verified local sync cache. Existing full-snapshot clients and uncertain full uploads remain supported. No database migration is required. Export a backup before updating, keep the existing browser data/config, and upload the new backend dependency before the updated library/API and browser entry points.

### ChatGPT plugin branding

`python3 scripts/package-plugin.py` creates a separate branded plugin ZIP with Khosra’s light/dark listing and composer icons and the existing remote MCP endpoint. The normal `python3 scripts/package.py` command also creates this ZIP beside the two website releases. See [plugin setup and installation](plugin/README.md). Optional `node scripts/render-plugin-icons.mjs` exports PNG copies for manual icon uploads. Website/SFTP updates do not change the branding of an existing ChatGPT connection; apply the plugin package through a supported dashboard/installation workflow or use that connection’s icon upload control if available. No remote installation or publication is performed by these scripts.

### Write and organize

1. Create or open a manuscript in **Library**.
2. Add chapters through **Contents → Add chapter**, or the plus below the desktop tool rail.
3. Write directly, or use **Chapter actions → Paste or replace chapter text** to import a draft. Formatted Word clipboard paragraphs are preserved as plain text; plain-text imports offer paragraph-break choices.
4. Double-click a paragraph, or focus it and press Enter, to edit. Enter starts/splits a paragraph; Shift+Enter inserts a line break. Changes save automatically to the server, with a recovery copy on this device. Check the save status before switching devices.
5. Use **Flags** to record feedback and **History** to inspect earlier text or restore deleted passages. Deleted chapters remain in **Contents → Deleted chapters** until restored.

Paragraphs have permanent UUIDs behind readable addresses such as `R1:C1-P1`. Explicit renumbering changes the reference edition, not the paragraph UUID. Use these references when discussing passages with a model; reader page numbers depend on typography.

Proposal lists show the newest first. Warm brown paragraph IDs in the manuscript indicate text or headings last changed through an accepted proposal. Hover over the ID for an explanation; copying its permanent reference works as before. Direct edits to that paragraph clear the mark.

Use **Review proposal** to read changes in context, compare a passage with its current text, edit the suggestion and choose which changes to accept. Review controls and decisions share one modal; acceptance and rejection always ask for confirmation. Completed proposals show their saved review and original source, with declined changes labelled.

### Collect ideas and reference artifacts

Open a manuscript, then **Context → Ideas** or **Context → Artifacts**. These belong to the whole book, including before the first chapter is written; chapter links are optional. Context remains reserved for revision-linked manuscript summaries and evidence. An idea does not become canon merely because it was saved: change its status to **Planned**, **Used** or **Discarded** yourself, and use the proposal workflow for prose changes.

Artifacts can contain a reference link, notes, and a PNG, JPEG, WebP or PDF attachment. Images preview privately; PDFs download. Limits are **2 MiB per file** and **8 MiB of raw attachments for the entire workspace**, including historical files. Every edit adds a version. Removing/replacing an attachment or archiving an artifact retains its earlier file in history and continues to use capacity. Use **Delete idea** or **Delete artifact** on a card to permanently remove that item and all its versions after confirmation. Unshared attachments are removed and their capacity is freed; files referenced by another item remain. A small deletion marker prevents old devices or reconciled backups from bringing the item back. Existing downloaded backups retain their copies. Models cannot delete items. Large reference libraries remain outside this version’s scope.

Connected models use `list_materials` (100 per page), `read_material`, `save_idea` and `save_artifact`. Lists omit note bodies and file bytes; explicit `include_file: true` returns native MCP image content or an embedded PDF resource, depending on client support. Models can create new speculative ideas and new references, but cannot edit existing author notes or mark ideas Planned/Used. Refresh the connected app's tool discovery after updating the backend. Khosra does not fetch external reference URLs automatically.

Full archives include material versions and attachment bytes. Reader shares exclude all Ideas and Artifacts. Concurrent edits retain separate visible versions; compare them before deciding which to use. Hosted synchronization sends changed records; unchanged attachment versions are not uploaded again. Initial synchronization and archives still include the required file bytes. Current archives without these collections load with empty lists; older deployed clients are prevented from erasing new material history and should be refreshed.

### Share with trusted readers

Wait for **Saved to server**, then open **Share for reading** from the desktop rail or Chapter actions. All chapters are selected initially; narrow the selection if needed. Enter a reader label, choose an expiry, create the link and send it yourself. Review feedback and revoke access from the same dialog.

Each link grants access to a fixed snapshot, not future edits or private history, flags, proposals, ideas and artifacts. Create another invitation to share an updated draft. Anyone holding the link can use it; the reader label is not identity verification. Revocation blocks subsequent requests but cannot recall text already copied. Guest reading requires an internet connection.

### Back up and export

Use **Settings → Backups & recovery → Download full archive** regularly and keep a copy outside the browser. To export one manuscript, open it first, then use **Settings → Export this book as text**; the Export section names the selected manuscript.

Restore accepts only the current, checksummed `khosra-archive` format; early prototype exports are unsupported. Browser archives contain workspace history. Guest invitations and reader feedback are stored separately on the server and require a database backup.

Long record lists use 100-item pages: proposals, flags, history sessions and recovery snapshots, deleted passages, the manuscript library, chapter Trash, context facts, ideas, artifacts, material version histories, reading invitations, reader feedback and sync conflicts. Controls appear only when needed; totals include the complete list. Collapsed history and Trash previews load their contents when opened. Manuscript text and chapter navigation stay continuous. Pagination limits rendered records; differential sync separately limits network transfers to changed records.

## Local development and standalone editing

The development server offers standalone local editing with explicit server transfer for testing. Production builds use the centralized login/autosave workflow. Connected chat-model access requires the hosted backend described below.

Requirements: **Node.js 22.16+** or a compatible current LTS, and npm. No PHP server is needed for local writing and reading.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The development server proxies `/api` to `http://127.0.0.1:8081` when a local PHP backend is available. The production application uses same-origin `/api` requests.

Run verification and produce the static build with:

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run test:hosted
npm run build
npm run test:offline
```

Playwright may need its browser system dependencies on Linux. Offline verification uses the production build, so build first. Windows users can run the npm commands in PowerShell or Command Prompt.

## Deploy: upload, extract and configure

Khosra works on any HTTPS domain at its document root. Browser requests and the MCP URL shown in Settings follow the current domain; set `origin` in your server config to match. No source-code domain edits are needed.

The simplest installation uses **SQLite**. No database account, SQL import or server-side Node setup is needed.

1. Back up any existing browser manuscripts and server data.
2. Upload `releases/khosra-0.2.0-upload-extract.zip` into the HTTPS domain document root, extract it there, then remove the uploaded ZIP. Keep the hidden `.htaccess` files.
3. Rename `khosra.config.example.php` to **`khosra.config.php`** and set your HTTPS `origin` and a unique `owner_password` of at least 16 characters.
4. Open Khosra and sign in. The first correct owner sign-in initializes the SQLite tables.
5. Bring an existing device draft online when prompted, or create a manuscript. Changes save automatically; then connect the chat client through OAuth.

Requirements: PHP 8.2+ with **PDO SQLite**, HTTPS and Apache/LiteSpeed support for `.htaccess` and rewrites. The server automatically creates a private data directory outside the website folder. If hosting permissions prevent that, set `data_dir` in the same config to an existing writable directory outside **all** public website roots. There are no API paths to edit.

Updates: back up first, then extract a newer upload-extract ZIP over the same installation. Release archives never contain your real `khosra.config.php` or SQLite data. Keep the same data location. Verify that HTTP requests to `/khosra.config.php` and `/khosra-server/lib.php` are denied, and check the MCP/OAuth routes before connecting a model.

For differential SFTP updates, the deployable mirror is tracked in `live/`; release ZIPs stay in ignored `releases/`. Run `python scripts/stage-live.py --apply` after building and packaging, review changes under `live/`, then upload those files through SFTP. The real `live/khosra.config.php` and runtime data remain ignored. Commit the baseline after a successful deployment so the next update is visible in Git.

SQLite stores manuscripts, operation history, invitations, reader feedback and OAuth records together. For a complete server backup, pause writes and copy the private data directory, or use a SQLite-consistent backup tool. Browser archives are still useful but exclude invitations and feedback. To move hosts, copy the config and private data securely and set the new `origin`/`data_dir`; do not place the database in the webroot.

**Existing MySQL installation:** it remains supported. Keep the original DSN, credentials and owner password hash in the new config, or continue with the advanced package below. Merely changing a DSN does not migrate data. Restoring a workspace archive into the new installation transfers manuscripts and history to a fresh SQLite installation, but not existing reading links, feedback or OAuth credentials; preserve the original database before switching.

## Advanced deployment: separate private backend / MySQL

Build locally and upload through your hosting provider's FTPS/SFTP tools. Production needs no Node runtime, SSH, queue, cron or WebSockets.

### 1. Check hosting and preserve existing data

You need:

- HTTPS and PHP **8.2+**, with PDO MySQL enabled.
- MySQL/MariaDB with InnoDB.
- Apache/LiteSpeed-compatible rewrite, header and access-denial support.
- A private directory outside **all** public document roots.
- The `Authorization` request header forwarded to PHP.

Export existing browser data from every device before replacing an installation, and back up the database and previous release. Browser-local drafts are not contained in the server files. Remove obsolete public files when updating; uploading a new release does not remove them automatically.

### 2. Build the deployment package

After the checks above pass:

```sh
npm run build
python3 scripts/package.py
```

On Windows, use `py scripts/package.py`. Two packages are produced with companion SHA-256 checksums: `releases/khosra-0.2.0-upload-extract.zip` for the simpler SQLite flow above, and `releases/khosra-0.2.0-ftp.zip` for this separate-private-directory MySQL layout. Extract it locally:

| Package directory | Destination |
| --- | --- |
| `webroot/` contents | Domain document root, including the hidden `.htaccess` file |
| `private/` contents | Private directory outside every public document root |
| `database/` | Import through a database administration tool; do not upload publicly |
| `instructions/` | Deployment/reference documents; keep outside the public webroot |

Never upload the complete ZIP, repository, tests, SQL, backups, real configuration or `node_modules` into the public directory.

### 3. Create and initialize the database

Create a database and restricted application user through the hosting control panel. For a fresh installation, import `database/schema.sql` from the package using phpMyAdmin or an equivalent tool, then run:

```sql
INSERT IGNORE INTO workspace(id,version,payload) VALUES
(1,0,'{"schemaVersion":1,"books":[],"chapters":[],"revisions":[],"flags":[],"proposals":[],"contexts":[]}');
```

For an existing installation that predates guest sharing, back up first and import the additive `database/sharing-upgrade.sql`. Fresh installations already include those tables. Restore workspace and operation-ledger data together; include invitation/session/feedback tables in database backups.

### 4. Configure the private backend

Rename the packaged `private/config.example.php` to `config.php` in the private directory. Configure:

- `dsn`, `db_user` and `db_password` for your database.
- `owner_password_hash`, generated locally using PHP's `password_hash($password, PASSWORD_DEFAULT)`.
- `origin`, set to the exact HTTPS origin of your installation.
- `oauth_redirect_allowlist`, containing the exact callback URI supplied by the intended chat client.

Leave `tool_token_hash` empty for normal OAuth use. Keep passwords and tokens out of browser environment variables, repository files, screenshots and chat messages.

Keep `lib.php`, `guide.php`, `proposal-edits.php`, `workspace-sync.php`, `materials.php`, `oauth.php` and `sharing.php` together in that private directory. Before uploading, edit the private file paths near the top of `webroot/api/index.php` to match the host. For example:

```php
require '/home/YOUR_ACCOUNT/khosra-private/lib.php';
require '/home/YOUR_ACCOUNT/khosra-private/oauth.php';
require '/home/YOUR_ACCOUNT/khosra-private/sharing.php';
// Set the existing $file assignment inside the try block:
$file = '/home/YOUR_ACCOUNT/khosra-private/config.php';
```

`lib.php` loads `guide.php`, `proposal-edits.php`, `workspace-sync.php` and `materials.php` from its own directory; no extra public path is needed.

### 5. Upload and verify

Upload the private backend files, then the built `webroot/` contents. Upload static assets before `index.html`, keep frontend/backend versions aligned and refresh author clients after an upgrade. Preserve `.htaccess`; it provides API routing, SPA routes, authorization forwarding and access restrictions.

Before trusting the deployment:

1. Confirm private files and configuration cannot be retrieved over HTTP.
2. Confirm `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` return the expected JSON.
3. Confirm an unauthenticated request to `/api/mcp` returns **401** with a Bearer authentication challenge, rather than an HTML page or 404.
4. Sign in, create a small manuscript, wait for Saved to server, and open it on another signed-in device. Check sign-out and a concurrent-edit conflict.
5. Connect the actual chat client through OAuth. Verify **guide → read → save proposal → automatic proposal refresh → author review/accept → Saved to server → reread**.
6. Check archive recovery, guest expiry/revocation and offline reload after an initial online load and service-worker activation.

The MCP URL is `https://YOUR_DOMAIN/api/mcp`. It uses stateless Streamable HTTP with JSON responses; GET/SSE streaming is unsupported. OAuth supports discovery, dynamic client registration, owner consent, S256 PKCE, scoped tokens, refresh rotation and revocation. Client/account availability and mobile or voice tool support must be checked in the intended client.

## Privacy and current limits

- A local recovery/offline copy is stored in IndexedDB. Opening a hosted workspace requires sign-in; an existing cached workspace can be opened explicitly during a network outage. Offline changes resume synchronization after reconnecting and signing in if needed. Production offline reload requires a successful initial load and service-worker activation; browser storage can be evicted. Keep independent backups.
- Server sign-in protects remote endpoints, not an existing browser profile. No end-to-end encryption is provided.
- Connected tool retrieval sends requested source text to the chat provider under that account's data controls. Khosra itself makes no paid model/STT API calls; hosting and any chat subscription remain separate costs.
- The owner MCP connection can access the saved server workspace; OAuth is not currently restricted to one manuscript.
- The server stores a versioned workspace document. Owner saves send record/paragraph deltas, with a **64 MiB decoded request limit** and negotiated gzip only when that actual request exceeds **20 MiB**; other API requests retain a 20 MiB limit. Host request/memory limits still apply and histories continue to grow. Sync is automatic, with conservative conflict checks and explicit review for divergent edits rather than automatic paragraph-level merging.
- Prose is plain text with optional subsection headings. Rich inline formatting, EPUB/PDF export and multi-author editing are not implemented.
- Local automated checks do not establish hosted compatibility or a successful real chat-model connection. Verify your deployed MCP/OAuth routes and run a real-client pilot before relying on model collaboration.

## Technology

React, TypeScript and Vite provide the interface; Dexie/IndexedDB stores the local workspace. A PHP API with PDO SQLite (or MySQL) handles owner access, synchronization, MCP/OAuth and guest invitations. A service worker caches static application assets and self-hosted fonts, excluding API responses.

## Attribution

The Share glyph is from Microsoft Fluent UI System Icons (MIT); its license ships as `Fluent-UI-System-Icons-LICENSE.txt`. Phosphor Icons and bundled libraries retain their licenses in the production `THIRD-PARTY-NOTICES.txt`. Self-hosted Noto Sans Bengali and Noto Serif Bengali use the SIL Open Font License, included under `public/fonts/`. No font CDN is required.
