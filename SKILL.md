---
name: "eltropy-sow-generator"
description: "Generate an Eltropy Statement of Work from a CPQ Google Sheet, with auto-recommended implementation phasing"
---

> **Portability:** this skill uses whatever **Google Drive connector** the current
> user has connected — do not hard-code a specific connector's tool IDs. At runtime,
> use the connected Google Drive tools for: searching/listing files (`search_files`,
> `list_recent_files`), exporting/downloading file content (`download_file_content`),
> and creating/uploading files (`create_file`). Each teammate must have their own Google
> Drive connector connected; the skill will use theirs automatically.

# Eltropy SOW Generator

Generate a standard Eltropy Statement of Work (SOW) as a **Word document (.docx)** that
exactly matches the Eltropy SOW template — same fonts (Trebuchet MS), heading styles,
and a live, updatable Table of Contents. It is driven by a CPQ Google Sheet and the
Eltropy Product Descriptions. The user picks one CPQ package column — **Essentials**,
**Enterprise**, or **Eltropy One** — and this skill pulls the "Included" SKUs from that
column, maps each to its product-marketing features, and fills the template in place.
The Phase Builder screen (CPQ first, then the open Salesforce opportunity) can also fill
Business Problems & Outcomes from a discovery document, **auto-recommend the
implementation phasing** for the loaded SKUs (dependencies, must-pair groups, capacity,
vendor lead time), and lets the user drag SKUs between phases before generating.

## When to use
Use whenever the user wants to create, draft, or automate an Eltropy SOW / Statement
of Work from a CPQ quote, or says things like "generate a SOW", "make an SOW from
this CPQ", "build a statement of work for <customer>", "recommend phasing for this deal".

## Inputs to collect (ask the user, use a multiple-choice question where possible)
1. **CPQ file** — let the user *select* it (see Step 1). They can either pick from a
   list of CPQ sheets found in their Google Drive, or paste a link / file ID. The
   relevant tab is named `Quote` (fallback: the first tab whose row ~15 has
   `Essentials / Enterprise / Eltropy One` in columns E/F/G).
2. **Package column** — Essentials (col E), Enterprise (col F), or Eltropy One (col G).
3. **Customer name** — optional override. By default it is read from the Quote tab
   (cell `C2`).

Do the CPQ selection (Step 1) first, then ask for the package column with the
AskUserQuestion tool. Do not proceed without a chosen file and a package column.

## FIRST ACTION ON INVOCATION — render the Phase Builder screen
As soon as this skill is invoked, immediately surface the **Phase Builder** artifact
(`id: eltropy-sow-phase-builder`) so the screen appears on the left right away — before
asking any questions or running the quick path. Do this per **Step 0** below. The
interactive Phase Builder is the default way to run; only fall back to the chat-driven
quick path (Steps 1–5) if the user explicitly asks for it or the screen can't be shown.

## Two ways to run
- **Interactive (default):** the Phase Builder screen opens on invocation; the user loads
  the CPQ first, picks one of the open Salesforce opportunities pulled for that customer,
  confirms contacts and business outcomes, loads SKUs, optionally clicks **Auto-recommend
  phases**, adjusts by drag-and-drop, and generates the SOW (Step 0 renders it; Step 6
  covers the flow and the build).
- **Quick (only on request):** pick a package column in chat → auto-generate a Phase-1 SOW
  (Steps 1–5).

## Files in this skill
- `scripts/extract_sow.py` — parses the CPQ, selects the package column, maps SKUs to
  product descriptions (features + acceptance criteria), writes `sow_data.json`. Its
  `match_product(name, index)` helper (with `load_products`) is also used to enrich
  phase-config SKUs that carry only a name + category.
- `scripts/phase_builder_template.html` — **the Phase Builder screen** (the team's layout).
  Edit this file to change the screen. Sections: 1. CPQ & Opportunity, 1b. Contacts &
  People, 1c. Business Problems & Desired Outcomes, 2. Phases (+ Auto-recommend),
  3. Assign each SKU, Recommendations & checks, 4. Phases built, Generate SOW.
- `scripts/build_artifact.py` — fills the template's placeholders only (connector tool
  IDs, build-task id, `rules.json` rules + CPQ section filter, the phasing engine,
  `registry.json`, `registry_aliases.json`, `xlsxlite.js`). It never changes the layout.
  All paths default to this skill's own folders, so it runs with no path arguments.
- `scripts/phasing_engine.js` — JS port of `phasing.ts` (name resolution, riders,
  pairing, dependency order, capacity packing, scheduling, checks). No UI.
- `scripts/xlsxlite.js` — dependency-free xlsx reader used inside the screen to parse
  the CPQ Quote tab in the browser (includes the fix that keeps empty self-closing cells
  from swallowing the next cell's value).
- `scripts/build_sow_docx.py` — fills the Word template in place, preserving fonts,
  styles and the TOC field. Accepts either `--data sow_data.json` (quick / Phase 1) or
  `--phase-config config.json` (multi-phase, from the screen), plus `--template`,
  `--out`, `--font`. It does **not** take a `--rules` flag and does not read
  `rules.json`. It sets the doc to auto-refresh the Table of Contents when opened.
- `reference/sow_template.docx` — the Eltropy SOW template (format master). Current
  version: "04. Summary SOW - Template", which splits each phase into three headings —
  Solution Outline - Phase N, Risks - Phase N, and Assumptions - Phase N. Those three
  sections are left as template text for the Implementation Manager to tailor.
- `reference/products.json` — normalized product/feature/acceptance-criteria mapping.
- `reference/rules.json` — implementation rules (implement-together, requires,
  avoid-together, phase-order) shown in the screen's **Recommendations & checks** panel;
  `section_include_only` rules become the CPQ section filter (e.g. only the Unified
  Conversations Platform row from the Platform section).
- `reference/registry.json` — **phasing data** for Auto-Recommend: per registry SKU its
  `capacity` (0–3 implementation load), `requires` (must be live in the same or an
  earlier phase), `mustPairWith` (implement together), `weeks` (duration), `category`,
  and `specialFlags` (`requiresVendor` = 3rd-party vendor PM). `constants` holds
  `PHASE_CAPACITY` (9), `CONCURRENT_CAPACITY_THRESHOLD` (4), phase labels and colors.
  Converted from `reference/phasing-engine/registry.ts`.
- `reference/registry_aliases.json` — maps every `products.json` / CPQ SKU name to a
  registry key (`null` = no registry entry → category-default timing).
- `reference/phasing-engine/registry.ts`, `phasing.ts` — original TypeScript source of
  the phasing model and algorithm (reference / provenance; the JS port lives inside
  `build_artifact.py`).

## Procedure

### 0. Render the Phase Builder immediately (do this first, every invocation)
The goal: the screen shows on the left the moment the skill runs, WITHOUT overwriting any
version the user has customized.

1. Call `mcp__cowork__list_artifacts` and check for `id: eltropy-sow-phase-builder`.
2. **If it already exists → surface it, do NOT regenerate.** Read the existing artifact's
   HTML from its manifest `path`, strip the leading auto-injected
   `<script id="cowork-artifact-meta">…</script>` header if present (the publish step
   re-adds it), write that HTML to a file in the working directory, and call
   `mcp__cowork__update_artifact` with the same `id`, that `html_path`, an
   `update_summary` like "Open Phase Builder", and `mcp_tools` =
   `[soqlQuery, download_file_content, create_file, search_files]` (the tools the screen
   calls). This re-renders the user's own screen unchanged and brings it to the front.
   **Never run `build_artifact.py` over an existing artifact** unless the user explicitly
   asks to rebuild it — regenerating discards their hand-edits (e.g., custom rules).
   If the existing screen has no **Auto-Recommend Phasing** card (an older version), tell
   the user it's available and offer to rebuild; only rebuild on their yes.
3. **If it does NOT exist → build it once** with `build_artifact.py` (see Step 6.1) and
   `mcp__cowork__create_artifact`.
4. Tell the user the builder is open on the left and they can start there. Then continue
   with Step 6 for the flow. Only use Steps 1–5 (chat/quick path) if the user asks.

### 1. Select the CPQ file
Let the user choose the CPQ file rather than requiring a pasted link:

1. If the user already pasted a Google Sheets URL or file ID, use it — extract the ID
   between `/d/` and the next `/`
   (e.g. `https://docs.google.com/spreadsheets/d/<ID>/edit`).
2. Otherwise, **search their Drive and present a pick list.** Use the Google Drive
   connector `search_files`, preferring CPQ-looking spreadsheets, e.g.:
   `mimeType = 'application/vnd.google-apps.spreadsheet' and title contains 'CPQ'`
   ordered by most recently modified. If that returns nothing, broaden to
   `title contains 'Quote'` or use `list_recent_files` for recent spreadsheets.
3. Present the candidates to the user with the **AskUserQuestion** tool — one option per
   file, labeled with the file title (and last-modified date if helpful). Always include
   an "Other — paste a link/ID" escape option so they can supply a file the search
   missed.
4. Use the selected file's `fileId`. Confirm the chosen file title back to the user
   before continuing.

If the user named a folder or customer instead of a file, scope the `search_files`
query accordingly (e.g. add `and parentId = '<folderId>'` or another `title contains`
clause) and present the matches the same way.

### 2. Download the CPQ as .xlsx
Use the Drive connector's `download_file_content` with
`exportMimeType = application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
The response is base64 (either inline in `content`, or saved to a file when large).
Decode it to `cpq.xlsx` in the working directory. Example:

```python
import json, base64
# `src` = the JSON payload (or the path to the saved tool-result file)
d = json.load(open(src)) if src.endswith('.txt') else src
open('cpq.xlsx','wb').write(base64.b64decode(d['content']))
```

### 3. Extract the selection from the CPQ
Ensure openpyxl + python-docx are available
(`pip install openpyxl python-docx --break-system-packages -q`), then:

```bash
python3 scripts/extract_sow.py \
  --xlsx cpq.xlsx \
  --column <essentials|enterprise|eltropy_one> \
  --products reference/products.json \
  --out-json sow_data.json \
  --out-html /tmp/ignore.html
# add --customer "<Name>" to override the customer name from the sheet
```

The script prints a summary: the customer, counts of selected solutions and
integrations, and any **UNMATCHED** SKU names (a SKU whose column-C name did not
match a product description). If there are unmatched names, tell the user — either
the CPQ uses a new name, or `reference/products.json` needs that entry/alias added.
(The `.html` output is a fallback only; the Word doc is the real deliverable.)

### 4. Confirm with the user
Show the selected solutions and integrations (from the script output or `sow_data.json`)
so the user can confirm the package column was correct before the document is built.

### 5. Build the Word SOW (.docx)
Fill the template in place — this preserves the exact fonts, styles and TOC field:

```bash
python3 scripts/build_sow_docx.py \
  --data sow_data.json \
  --template reference/sow_template.docx \
  --out "SOW - <Customer> (<Package>).docx"
```

The dynamic parts populated are: the Title, the Presented-To defining cell, the
**Proposed Solutions** table (one row per selected solution / integration, features as
bullets, first-value-moment), and the **Phase 1** Solutions/Integrations lists.
Business Problems, Solution Outline / Risks / Assumptions and Out-of-Scope are left as
template text for the Implementation Manager.

Then deliver the file:
- Present the `.docx` to the user with the file-card tool, **and/or**
- Upload it to Drive with `create_file` using `contentMimeType =
  application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `base64Content` = the file bytes, and `disableConversionToGoogleType = true`
  (so it stays a real Word file). Add `parentId` to file it in a specific folder.

**TOC note:** the Table of Contents is a live Word field. The builder sets the
document's `w:updateFields` flag, so Word refreshes the TOC (and its page numbers)
automatically the first time the file is opened — the user may see a "update fields?"
prompt; clicking Yes (or select-all + F9) fully repaginates it. Google Docs also
recomputes the TOC on open. Tell the user to open it once so the TOC populates.

### 6. Interactive Phase Builder (Salesforce-linked, self-serve setup)
The user loads the CPQ and selects the opportunity **inside the screen** — no chat search
needed. On invocation the screen is already
open (Step 0); the substeps below cover building it when missing, and the in-screen flow.

**6.1** Generate the screen — only when it does not already exist (Step 0 case 3), or when
   the user explicitly asks to rebuild it:
   ```bash
   python3 scripts/build_artifact.py \
     --sf-tool "<the user's Salesforce soqlQuery tool id>" \
     --drive-tool "<the user's Google Drive download_file_content tool id>" \
     --drive-create-tool "<the user's Google Drive create_file tool id>" \
     --drive-search-tool "<the user's Google Drive search_files tool id>" \
     --out artifact.html
   ```
   The layout comes from `scripts/phase_builder_template.html`; data paths default to this
   skill's `reference/` and `scripts/` files. Pass the **current user's** connector tool IDs.

   **Publish rule — create vs. update, and never clobber the user's version.** The
   Phase Builder uses a fixed id (`eltropy-sow-phase-builder`). Always check first:
   - Call `mcp__cowork__list_artifacts` and look for `id: eltropy-sow-phase-builder`.
   - If it does **not** exist → `mcp__cowork__create_artifact` with
     `id: eltropy-sow-phase-builder`, `html_path: artifact.html`, and `mcp_tools`
     (`soqlQuery, download_file_content, create_file, search_files`).
   - If it **already exists** → do **not** publish over it; surface the existing version
     (Step 0 case 2). Only rebuild-and-`update_artifact` when the user explicitly asks.
     If the user has hand-edited their live screen, copy those edits into
     `phase_builder_template.html` first so a rebuild keeps them. Earlier versions are
     kept by Cowork under the artifact's `versions/` folder if one ever needs restoring.

**6.2** The in-screen flow, in order:
   1. **CPQ first** — search Drive or paste the CPQ link, then **Load CPQ**. The Quote tab
      is read in-browser; the customer (C2) and the package names (row 15) fill in.
   2. **Opportunity** — right after the CPQ loads, **open** Salesforce opportunities whose
      name or account matches the customer are pulled automatically (`IsClosed = false`;
      tick *Include closed opportunities* to widen). The user clicks one; its account name
      becomes the customer. **Search Opportunities** re-runs the lookup after edits.
   3. **1b. Contacts & People** — Business Sponsor (Account Project Sponsor), Account
      Executive (Owner) and Solution Engineer (SE of Record, resolved via the User object)
      auto-fill when an opportunity is selected; all nine fields are editable and can be
      typed in without an opportunity.
   4. **1c. Business Problems & Desired Outcomes** — optionally pick a **discovery
      document** (Google Doc; search Drive or paste a link) and click **Fill from
      Document**: the doc is read as text and the problem/outcome pairs are extracted
      (via the screen's AI helper, with a "Problem: / Outcome:" and table-line fallback),
      excluding personal information. Rows stay editable; the user can also type them.
   5. **Package → Load SKUs**, then **2. Phases**: set the number of phases, or click
      **⚡ Auto-recommend phases** (start date, capacity, concurrent limit). It assigns
      every SKU, fills phase start/end dates (MM/DD/YYYY) and keeps PM names already typed.
   6. **Adjust** with the phase buttons in step 3 or by dragging SKUs between the phase
      boxes in step 4 (or from the step-3 list onto a box). **Recommendations & checks**
      shows the `rules.json` messages plus live phasing checks (prerequisite order,
      must-pair splits, capacity, vendor lead time, SKUs without registry data).

**6.3** **Generate SOW** saves `ELTROPY_SOW_CONFIG <customer> <timestamp>` to Drive and runs
   the `eltropy-sow-build` task. The config contains `customer`, `package`, `opportunity`,
   `cpq`, `people`, `business_outcomes` ([{problem, outcome}]), `discovery_doc`
   ({id, title} or null) and `phases` ([{phase, start, end, pm, skus:[{name, category}]}]).
   To build manually, save it as `phase_config.json`, enrich each SKU with `features`,
   `notes`, `matched_name`, `first_value_moment` and `acceptance_criteria` using
   `extract_sow.load_products` + `extract_sow.match_product` against
   `reference/products.json` (otherwise the build fails with `KeyError: 'features'`), then:
   ```bash
   python3 scripts/build_sow_docx.py --phase-config phase_config.json \
     --template reference/sow_template.docx \
     --out "SOW - <Customer> (<Package>).docx"
   ```
   If `business_outcomes` is empty but `discovery_doc` is set, read that Google Doc with the
   Drive connector (`read_file_content`), extract concise problem/outcome pairs (no
   personal information), add them as `business_outcomes`, then build.
   This fills Phases 1–N, Proposed Solutions, People, Business Problems & Desired
   Outcomes, and tags the SOW with the Salesforce opportunity. Present the `.docx` as in
   Step 5.

**Salesforce write-back:** the current Salesforce connector is **read-only** (query
only). The SOW cannot be auto-attached to the opportunity. To close the loop, upload the
`.docx` to Google Drive (Step 5) and give the user the link to attach on the opportunity,
or note that a write-enabled Salesforce connection is required to automate it.

**In-browser CPQ note:** the CPQ export can be large. If the browser cannot fetch the
file content, the screen shows an error; fall back to the chat quick path (Steps 1–5).

The `rules.json` file is designed to grow: add objects to its `rules` array (see the
`_doc` block inside it for the schema) to encode more "implement together / don't
combine / requires / phase order" logic. The screen picks up new rules automatically.

## Auto-Recommend Phasing (how it works)
The engine is a JS port of `reference/phasing-engine/phasing.ts`, running in the browser
over the SKUs loaded from the CPQ:

1. **Resolve names.** Each loaded SKU name is mapped to a registry key via
   `registry_aliases.json` (exact, case/punctuation-insensitive). An explicit `null`
   means "no registry entry". Names missing from the alias file fall back to exact then
   fuzzy matching against registry keys.
2. **Riders.** When several loaded SKUs map to the same registry key (e.g. the Unified
   Conversations Platform and Text Messaging both map to `Text`), the first carries the
   capacity and dependencies; the others ride along at zero capacity in the same slot.
3. **Defaults.** SKUs with no registry entry get category-default timing (Platform 2/10w,
   Solutions 2/8w, Integrations 2/6w, Bundles & Misc 0/2w, other 1/4w — capacity/weeks)
   and depend on the platform/Text SKU so they are sequenced after it.
4. **Pair → order → pack → schedule.** Must-pair SKUs are grouped (never split),
   groups are topologically ordered by `requires` (integrations kept next to their base
   module), then greedily packed into the earliest phase that satisfies dependencies and
   `PHASE_CAPACITY` (a must-pair group larger than capacity gets its own phase and is
   flagged). Within a phase, SKUs run in concurrent slots up to
   `CONCURRENT_CAPACITY_THRESHOLD`, and dates are laid out slot by slot from the start
   date.

**Maintaining the phasing data:** edit `reference/registry.json` to change a SKU's
capacity, weeks, dependencies, pairings or vendor flag, or to add a SKU; edit
`reference/registry_aliases.json` when the CPQ / products.json uses a new name (keep one
entry per products.json name). If you receive an updated `registry.ts`, convert it to
`registry.json` (same `skus` + `constants` shape) and keep the `.ts` in
`reference/phasing-engine/`. Changes take effect in the screen only after the user asks
to rebuild the Phase Builder (Step 6.1 + `update_artifact`).

## How selection works (for reference / debugging)
- The extractor finds the header row where E/F/G = Essentials/Enterprise/Eltropy One.
- Below it, column **B** labels the section: `Platform`, `Solutions`, `Integrations`,
  `Bundles & Misc`, then `Included Limited Usage`, then pricing rows.
- A row is **selected** when the chosen package column equals `Included`
  (also accepts Yes/Y/True/✓/X). Generic placeholder names (bare "Solutions",
  "Integrations", etc.) are skipped.
- Column **C** holds the SKU name; it is matched to `reference/products.json` by exact,
  then alias, then substring match. Matched features/notes/first-value-moment fill the
  "Proposed Solutions" table. Selected items also seed the Phase 1 "SKUs to be
  Implemented" list.
- `Included Limited Usage` rows with a non-zero value become an "Included Usage" table.

## Notes
- The SOW is explicitly **non-binding / informational** — the template disclaimer text
  is included automatically. Do not present it as a contract.
- Recommended phasing and dates are a starting point from the registry's effort model;
  the Implementation Manager should review and adjust them before the SOW is shared.
- Solution Outline / Risks / Assumptions for each phase are left as template text for
  the Implementation Manager to tailor.
- Financial figures pulled from the CPQ must be independently verified before use.
- To keep product descriptions current, regenerate `reference/products.json` from the
  source Product Descriptions document whenever it changes, preserving the same schema,
  and add any new names to `reference/registry_aliases.json`.


## Salesforce field mappings (Sep 2026 template)
The Phase Builder auto-fills the SOW's People table and the "Eltropy Tracking Id:" line
from the selected Salesforce opportunity. All people fields remain editable in the screen.

- **Customer Business Sponsor** <- the opportunity Account's **Project Sponsor**
  (`Opportunity.Account.Project_Sponsor__r`: Name / Email / Phone).
- **Eltropy Account Executive** <- the opportunity **Owner** (`Owner.Name/Email/Phone`).
- **Eltropy Solutions Engineer** <- the opportunity **SE of Record** (`SE_of_Record__c`,
  a text name). Because it is a name, the screen resolves it against the **User** object
  (`SELECT Name, Email, Phone FROM User WHERE Name = '<SE of Record>' AND IsActive = true`)
  to fill the SE email and phone.
- **Approver Name (page 1)** <- the **Solutions Engineer** name (`fill_approver_name`).
- **Signature block** (table 'Company | Eltropy'): the Eltropy signatory **Name/Title** are HARDCODED in the template (Prasad Shrotri) and are left unchanged; only the Eltropy-side **Date** is set to today (`fill_signature`). The **Company** header/placeholder is replaced with the customer name document-wide (`replace_company`). Table lookups are by header text, so template reordering no longer breaks the build.
- **Salesforce Opportunity ID** -> written onto the **"Eltropy Tracking Id:"** placeholder
  line under Proposed Solutions in the Word doc (via `build_sow_docx.fill_tracking_id`).

The People section in "04. Summary SOW - Template" is a labeled table
(Role | Name | Email | Phone). `build_sow_docx.fill_people` detects this grid layout and
fills the Business Sponsor / AE / SE rows; it still supports the older placeholder layout.

## Product mapping note
`reference/products.json` includes the alias `AI Agents-Voice` (and `AI Agent Voice` /
`AI Agent-Voice` / `AI Agents - Voice`) -> **AI Virtual Agents - Voice**, mirroring the
existing `AI Agents-Chat` alias, so the CPQ "AI Agent Voice" SKU no longer mis-matches to
Voice+ via loose substring matching.
