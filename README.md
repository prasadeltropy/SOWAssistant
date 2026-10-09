# SOW Assistant

Generate a standard **Eltropy Statement of Work (SOW)** as a Word document (`.docx`)
that matches the Eltropy SOW template — same fonts (Trebuchet MS), heading styles, and
a live, updatable Table of Contents. The tool is driven by a CPQ quote (Google Sheet /
`.xlsx`) and the Eltropy product descriptions, and can auto-recommend implementation
phasing for the selected SKUs.

> This tool produces an **informational, non-binding** SOW summary. Any financial
> figures pulled from a CPQ must be independently verified before use.

## What it does

- Reads a CPQ quote and a chosen package column (**Essentials**, **Enterprise**, or
  **Eltropy One**) and pulls the "Included" SKUs.
- Maps each SKU to its product-marketing features and acceptance criteria from
  `reference/products.json`.
- Fills the Eltropy SOW Word template in place: title, proposed-solutions table,
  people, business problems & desired outcomes, and per-phase SKU lists.
- Optionally auto-recommends phasing (dependencies, must-pair groups, capacity, vendor
  lead time) via the phasing engine.

## Repository layout

```
SKILL.md                         Tool definition and full procedure
scripts/
  extract_sow.py                 Parse CPQ, select package column, map SKUs -> products
  build_sow_docx.py              Fill the Word template in place (quick path or phase-config)
  build_artifact.py              Build the interactive Phase Builder screen
  phase_builder_template.html    Phase Builder UI layout
  phasing_engine.js              JS phasing model (name resolution, pairing, scheduling)
  xlsxlite.js                    Dependency-free xlsx reader used by the screen
reference/
  products.json                  Product / feature / acceptance-criteria mapping
  registry.json                  Phasing data (capacity, weeks, requires, pairings)
  registry_aliases.json          CPQ/product name -> registry key aliases
  rules.json                     Implement-together / requires / phase-order rules
  sow_template.docx              Eltropy SOW template (format master)
  phasing-engine/                Original TypeScript source of the phasing model
```

## Setup

Requires Python 3.9+.

```bash
pip install -r requirements.txt
```

## Usage (quick / Phase 1 path)

```bash
# 1. Extract the selected package from the CPQ workbook
python3 scripts/extract_sow.py \
  --xlsx cpq.xlsx \
  --column enterprise \
  --products reference/products.json \
  --out-json sow_data.json \
  --out-html /tmp/ignore.html

# 2. Build the Word SOW from the extracted data
python3 scripts/build_sow_docx.py \
  --data sow_data.json \
  --template reference/sow_template.docx \
  --out "SOW - <Customer> (<Package>).docx"
```

## Usage (multi-phase / Phase Builder path)

The Phase Builder saves a `phase_config.json` (customer, package, opportunity, people,
business outcomes, and phases with SKUs). Enrich each SKU's `features` /
`acceptance_criteria` from `reference/products.json` (via
`extract_sow.load_products` + `extract_sow.match_product`), then:

```bash
python3 scripts/build_sow_docx.py \
  --phase-config phase_config.json \
  --template reference/sow_template.docx \
  --out "SOW - <Customer> (<Package>).docx"
```

## Notes

- The Table of Contents is a live Word field; the builder flags the document to refresh
  it on first open. Open the file once so the TOC populates.
- `Solution Outline`, `Risks`, and `Assumptions` per phase are left as template text for
  the Implementation Manager to tailor.
- Keep customer-specific inputs and generated SOWs out of version control (see
  `.gitignore`).
