# Changelog

## Unreleased

- Added visible OAuth connection progress and blocked duplicate consent submissions while preserving Allow/Cancel POST decisions. Versioned the consent script URL so browsers fetch the updated password reveal and submission controls.

- Kept independent OAuth consent forms valid across repeated authorization requests, bounded to ten pending forms per session. Invalid form submissions no longer erase other pending requests. Persist consent before rendering and distinguish missing sessions, invalid/reused forms and expired forms.

- Moved the SFTP deployment mirror to Git-tracked `live/`, preserving ignored host config and runtime data. Updated the staging helper and local SFTP context.

- Added a checksum-verified differential release staging helper for the local SFTP mirror. It copies only changed release files and preserves real config, private data and older assets without uploading or deleting files.

- Fixed OAuth consent origin/referrer handling and callback CSP so ChatGPT connections can complete without weakening consent POST, nonce, PKCE or redirect checks. Added accessible show/hide controls to every password field, including server-rendered consent.

- Refreshed the favicon from the latest supplied logomark and advanced its cache version for the fresh upload release.

- Show HTTP status and structured server errors when opening a hosted workspace fails, instead of reporting every API failure as a connection problem. Retained recovery and offline behavior.

- Fixed release ZIP permissions: files now extract as 0644 and explicit directories as 0755. Previously generated .htaccess files were 0600 and unreadable by LiteSpeed, while Windows-mounted source files inherited 0777. Added existing-installation recovery guidance.

- Moved hosted sync status into the header tools, removing the separate strip and its overlap with workspace navigation. Retained retry, conflict review and accessible status messages.

- Added the supplied SVG logomark as the browser favicon and cached it for offline use. Updated to the brighter supplied artwork for dark browser tabs.

- Replaced the English header wordmark with the supplied Bengali SVG in the owner workspace, sign-in and guest reader, using the earlier logo text color.

- Simplified sign-in to a compact, centered single-column form with the heading and status directly above the password field.

- Added a sign-out icon and a lightly tinted, outlined button to make the session action easier to find.

- Redesigned sign-in and Settings & connections with a flat editorial layout, open sections, fine rules, plain icons and more legible text. Removed rounded card containers and shortened explanatory copy while retaining all controls and behavior.

- Made hosted workspaces server-central: required sign-in, automatic saves, cross-device/model refresh, explicit adoption of existing browser drafts, conflict review, offline recovery and stale-tab protection. Replaced optional Private server controls with Workspace & sign-in and Sync now. Updated MCP onboarding and deployment guidance.

- Removed the early browser-prototype importer and automatic prototype-format detection. Archive restore now accepts only validated current Khosra archives. Updated deployment guidance and rejection coverage while retaining current workspace history and attachment data.

- Removed fixed deployment-domain assumptions. Settings displays/copies the current origin’s MCP URL; templates, package instructions and connection documentation are generic. Added browser coverage on two alternate HTTPS origins, including a custom port, and configured-origin OAuth metadata checks.

- Added a single-root upload/extract release with one persistent config file, SQLite by default, private data outside the webroot and authenticated first-sign-in table setup. Retained MySQL support, password-hash compatibility and the advanced package. Added SQLite writer locking/concurrency checks and verified portable OAuth, manuscript iteration and guest sharing through Apache.

- Audited manuscript/model collaboration across local browser, PHP/MySQL and OAuth flows. Added an isolated 20-check collaboration HTTP regression and reproducible fixture preparation. Recorded live MCP/discovery HTTP 404 blockers and the first-client pilot checklist in COLLABORATION-AUDIT.md, included in the FTP handoff.

- Matched the desktop Add chapter circle border to its navigation strip in both contrast modes and slightly strengthened the chapter status badge text.

- Added the authenticated, read-only get_khosra_guide MCP tool with product/workflow guidance and examples, referenced by initialization and copied project instructions. Guide content contains no manuscript data and needs no workspace reads.

- Removed the reader Preferences button border and inset its visible surface with 6px vertical spacing inside the unchanged 44px toolbar. Retained keyboard focus and a 44px pointer target.

- Added Settings → Appearance → High contrast, saved on the device and synchronized across open tabs. Boosts text/icon/control and border contrast while preserving existing background colors, translucent surfaces, reader paper, textures and preview swatches. Appearance sits directly above Backups & recovery.

- Relaxed Chapter actions spacing and replaced the delete row with a separate softly tinted panel, explanatory text and an outlined Delete button.

- Moved Back to library to the mobile Contents footer and hid it on desktop. Compacted Chapter actions with tighter rows, inline desktop ordering controls and less footer space; modal layers now stay above navigation.

- Added confirmed chapter deletion in Chapter actions and preview/restore through Contents → Deleted chapters. Text, references, approvals, history and annotations remain recoverable; Trash is retained in archives/sync and excluded from active manuscript reading/export/new sharing. Sync reconciles deletion explicitly, and tools cannot modify trashed chapters.

- Added a single-book bookmark icon beside the manuscript name in Contents.

- Unified Chapter actions and desktop Share buttons on the supplied Fluent UI share icon.

- Added a separate desktop Add chapter button beneath the tool rail. Contents now stays above mobile navigation, keeps its Add chapter footer accessible, and includes Back to library.

- Replaced the desktop Share icon with the author-provided Fluent UI share SVG.

- Added a desktop-only Share rail action with an outward-arrow icon. Redesigned Share around a visible manuscript summary and compact connection states; added Select all/Clear selection. Highlighted the current manuscript in Settings Export.

- Clarified Share sign-in and added distinct setup/unavailable states with Retry and Server settings, instead of showing a password prompt for every connection failure.

- Set the author and guest reader default font size to 14pt, retaining saved choices.

- Added private reading invitations with fixed selected-chapter snapshots, hashed expiring access codes, revocation, isolated guest reader sessions and source-anchored reader feedback. Share is available inside Chapter actions; existing workspace controls remain unchanged.

- Added a subtle header chevron between Library and the current manuscript.

- Added three recent-history shortcuts in the writing margin, omitted empty-only cleanup from visible history, aligned delete confirmation to the right, and strengthened restored labels after renumbering.

- Gently increased foreground contrast throughout the workspace, library, settings, dialogs and reader, with darker text/icons and slightly stronger control outlines.

- Empty-paragraph quick removal, separate Clear and confirmed Delete, and a History filter with individual deleted/cleared paragraph recovery.

Removed persistent paragraph action rows. Double-click or keyboard activation now opens an auto-growing editor with Done, New paragraph, Flag and Delete controls. Enter continues/splits at the caret, Shift+Enter keeps a manual line break, and boundary Backspace/Delete join paragraphs. Stable references, subsection headings, autosave and recoverable deletion history are preserved.

Fullscreen Fit page/100% now measures the complete footer and bottom padding, keeping chapter navigation visible without scrolling. Wide screens place chapter buttons beside the centered page picker; narrow screens retain compact stacked controls. Removed the extra bottom gaps.

Fullscreen percentage zoom now uses the usable page area below the sticky controls as its 100% baseline. Toolbar-height changes update the calculation; normal-mode scale and text pagination stay unchanged.

Added a remembered Fullscreen zoom preference, defaulting to Fit page so the entire sheet is visible. Fit width and percentage presets are also available. Normal reading size and fixed point-based pagination are preserved; native fullscreen and the window-filling fallback use the same zoom setting.

Changed reader typography to 8–16pt on a fixed physical paper canvas. Fullscreen and display resizing now scale pages and text together without changing line breaks or page count. Made normal reading larger and widened desktop preferences into compact typography/paper and reading columns. Page-turn insets account for display scale.

Adjusted reader text sizes for fixed paperback pages: 8–16px in 1px steps, default 12px. Existing in-range choices remain intact and previously supported larger sizes clamp to 16px.

Paged reading now keeps fixed paperback proportions instead of deriving paper height from lines and leading. Added Paperback (default), Digest and A5 formats, with Tight/Normal/Relaxed margins. Typography reflows inside the selected trim; paper fits the available screen, spreads retain equal pages, and flip copies use measured new insets. Page format replaces Lines per page; earlier line-count preferences no longer determine paper shape.

Replaced the reader text-size dropdown with compact minus/value/plus buttons, stepping by 1px from 14px to 32px. Boundary buttons disable at the limits, and the live size readout announces changes. Saved sizes and the 21px default are retained.

Expanded reader text sizes to every integer from 14px through 32px, using one shared list for the picker and saved-preference validation. Existing sizes and the 21px default are retained.

Tightened paragraph spacing: reader gaps are 0.35em instead of 1em in continuous/paged/spread text and flip copies. Reduced editor paragraph/tool-row spacing while retaining existing action target sizes. Text, internal line breaks, line spacing and paragraph references are unchanged.

Matched Library and manuscript-name masthead text at 15px. Increased small chapter labels, status/reference metadata and manuscript toolbar text by 1px, retaining responsive sizes and existing title typography.

Polished Paste a chapter with a wider paper-like editor, a compact break-style/count toolbar and a separate revision-save footer with Undo. Initial chapter imports now fill the untouched P1 placeholder, preserving its UUID; later replacements retain exact matches and allocate unused labels without changing existing references.

Redesigned Chapter actions into compact icon rows, paired chapter-order controls and an expandable subsection editor with paragraph previews. Chapter actions and Paste a chapter stay open on outside clicks; Close and Escape still dismiss them. The keyboard focus loop skips collapsed content.

Fixed full-chapter pasting from Word: formatted clipboard paragraphs are preserved, with manual line breaks kept inside their paragraphs. Added a live paragraph count, plain-text break controls and Undo paste. Unchanged paragraph IDs and immutable history are retained. Paste dialogs now stay above the mobile navigation, and keyboard focus skips disabled controls.

Made Reading preference switches smaller and their rows more compact, with roomier full-row tap targets on touch devices.

Added an optional reading-progress indicator: a thin, light muted green line over a grey track along the toolbar’s bottom edge. It follows the visible page/spread or continuous scroll position, works in fullscreen, and remembers the setting on this browser.

Made the fullscreen toolbar flush with the screen’s top edge, with square top corners on the strip and its controls.

Softened the fullscreen reader’s sticky toolbar into translucent glass, with background blur and lightly tinted controls to keep labels recognizable over page text.

Added an optional, persistent Drag to turn pages reader setting. Horizontal primary-mouse drags turn pages or spreads; Shift preserves optional text selection. Short, vertical and cancelled gestures do not turn pages. Touch swipes keep their existing behavior.

Added comfortable page margins: 12px more around desktop page text and at each side of the spread seam, with an 8px horizontal increase on phones. Fit-screen pagination accounts for the added vertical padding; page turns use the same measured insets.

Successful device saves now recede to a subtle check badge; hover or keyboard focus reveals the full status. Saving and failures retain visible text, with reduced-motion-aware activity feedback.

Added a Phosphor Books icon to Library, a subtle outlined save-status badge, and a quieter pencil/Workspace return button in the reader.

Made Library and the manuscript name more prominent in the masthead. Reading mode shows the novel title centered, with balanced header columns and compact phone controls.

Redesigned Settings with compact server and ChatGPT connection panels, a copyable endpoint, expandable setup guidance, and clear backup actions. Added a Back control that restores the previous workspace section, reader or library; the settings header button also toggles back. Server sign-in shows progress and clears the password after success.

Unified header actions with Phosphor Regular icons at 20px, consistent color. Replaced the ornate settings gear with matching adjustment sliders.

Rebuilt reading preferences as a compact centered dialog on desktop and a bottom sheet on phones. Aligned paper controls, standardized labels and field sizes, added paper-color previews, and placed accessible switches beside their labels. A dimmed backdrop separates preferences from the manuscript; Escape, close and backdrop dismissal return focus to the trigger.

Refined the reader after reviewing the supplied page-turn recording: the full paper surface, margins and folios now turn around the spine, with adjacent turns queued to prevent overlapping leaves. Softened Sepia and made Grain coarser and monochrome. Reorganized preferences into Typography, Paper and Reading, added persistent text-selection and paragraph-ID toggles, placed wide-screen page arrows beside the paper, and added native fullscreen with a window-filling fallback.

Clarified the Flags empty state with a brief example and the ChatGPT proposal-review workflow.

Mobile navigation now shows all five labelled buttons at all times in a full-width translucent rounded bottom bar, with Manuscript in the center. Kept the desktop rail gap at 1.5rem (24px).

Polished the full-width masthead and fixed the chapter tool rail at one height to remove its scroll jump. Chapter rename keeps the pencil visible and reveals its label on hover/focus. Reader page turns now rotate a 3D leaf with outgoing and incoming text faces, directional shadows, reverse turns, and reduced-motion handling. Added three paper colors (Ivory, White, Sepia) and three textures (Smooth, Fine grain, Linen), stored locally.

Added a compact masthead on scroll, an accessible icon tool rail, and a visible chapter Rename action. Rebuilt reading mode with continuous/single-page/two-page layouts, browser-based text pagination, fit-screen or adjustable page length, text size and spacing controls, page picker, keyboard/swipe navigation, animated page turns, and reduced-motion support. Reading preferences stay on the device; manuscript revisions are unchanged.

Replaced the persistent dashboard sidebar with a manuscript library, book covers, chapter contents drawer, horizontal folio tabs, and a centered writing desk. Added actionable empty states for the library, blank chapters, flags, proposals, history, and context. Chapter tools are hidden until a manuscript exists.

Removed decorative heading labels, taglines, and repeated introductory copy across the workspace. Kept functional instructions and manuscript metadata.

## 0.2.0

Reframed Khosra as a private manuscript repository for ChatGPT-assisted writing, with author editing and proposal approval. Added stable passage references, optional chapter subsections, immutable history, flags, historical reincorporation, context indexes, validated backup/restore, responsive paper-inspired UI and Phosphor icons. Added a private PHP/MySQL workspace API and restricted MCP tools. No paid model APIs, live integration claims, or deployment claims.
