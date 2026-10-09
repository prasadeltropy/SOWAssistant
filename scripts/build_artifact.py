#!/usr/bin/env python3
"""Generate the Eltropy SOW Phase Builder artifact HTML.

The screen is scripts/phase_builder_template.html (the team's Phase Builder):
  1.  CPQ & Opportunity - pick/paste the CPQ, Load CPQ (read in-browser with
      xlsxlite); open Salesforce opportunities for the CPQ's customer are then
      pulled automatically for the user to select ("Include closed" optional).
  1b. Contacts & People - Business Sponsor, Account Executive, Solution
      Engineer (name/email/phone); auto-filled from the selected opportunity,
      always editable.
  1c. Business Problems & Desired Outcomes - optional discovery document
      (Google Doc) to fill the rows, or type them; editable.
  2-4. Phases - number of phases, Auto-recommend phases (registry-driven),
      per-SKU phase buttons, drag-and-drop between phase boxes, rules.json
      recommendations + live phasing checks, dates/PM, Generate SOW.

This script only fills the template's placeholders; it does not change the
layout. Edit the template itself to change the screen.
"""
import json, argparse, os, re

_HERE = os.path.dirname(os.path.abspath(__file__))
_REF = os.path.join(_HERE, "..", "reference")
ap = argparse.ArgumentParser()
ap.add_argument("--template", default=os.path.join(_HERE, "phase_builder_template.html"))
ap.add_argument("--reader", default=os.path.join(_HERE, "xlsxlite.js"))
ap.add_argument("--engine", default=os.path.join(_HERE, "phasing_engine.js"))
ap.add_argument("--rules", default=os.path.join(_REF, "rules.json"))
ap.add_argument("--registry", default=os.path.join(_REF, "registry.json"))
ap.add_argument("--aliases", default=os.path.join(_REF, "registry_aliases.json"))
ap.add_argument("--sf-tool", default="mcp__55eeda97-1297-4950-92a9-bffa25c3d2a3__soqlQuery")
ap.add_argument("--drive-tool", default="mcp__b506cf88-0433-4acb-8870-4616ba0d866e__download_file_content")
ap.add_argument("--drive-create-tool", default="mcp__b506cf88-0433-4acb-8870-4616ba0d866e__create_file")
ap.add_argument("--drive-search-tool", default="mcp__b506cf88-0433-4acb-8870-4616ba0d866e__search_files")
ap.add_argument("--build-task", default="eltropy-sow-build")
ap.add_argument("--out", default="artifact.html")
args = ap.parse_args()

rd = lambda p: open(p, encoding="utf-8").read()
html = rd(args.template)
rules = json.load(open(args.rules, encoding="utf-8")).get("rules", [])
registry = json.load(open(args.registry, encoding="utf-8"))
aliases = json.load(open(args.aliases, encoding="utf-8"))
consts = registry.get("constants", {})

# rules.json -> the screen's RULES list and the CPQ section filter (SECTION_KEEP)
view_rules = [r for r in rules if r.get("type") != "section_include_only"]
section_keep = {}
for r in rules:
    if r.get("type") == "section_include_only":
        section_keep[r["section"]] = [k.lower() for k in r.get("keep", [])]

# engine first (it carries the __REGISTRY__/__REG_ALIASES__ placeholders)
html = html.replace("__ENGINE__", rd(args.engine))
subs = {
    "__REGISTRY__": json.dumps(registry, ensure_ascii=False),
    "__REG_ALIASES__": json.dumps(aliases, ensure_ascii=False),
    "__PHASE_CAP__": str(consts.get("PHASE_CAPACITY", 9)),
    "__CONC_CAP__": str(consts.get("CONCURRENT_CAPACITY_THRESHOLD", 4)),
    "__RULES__": json.dumps(view_rules, ensure_ascii=False),
    "__SECTION_KEEP__": json.dumps(section_keep, ensure_ascii=False),
    "__SF_TOOL__": args.sf_tool,
    "__DRIVE_DL_TOOL__": args.drive_tool,
    "__DRIVE_CREATE_TOOL__": args.drive_create_tool,
    "__DRIVE_SEARCH_TOOL__": args.drive_search_tool,
    "__BUILD_TASK__": args.build_task,
}
for k, v in subs.items():
    if k not in html:
        raise SystemExit("template is missing placeholder " + k)
    html = html.replace(k, v)
left = sorted(set(re.findall(r"__[A-Z][A-Z_]+__", html)) - {"__READER__"})
if left:
    raise SystemExit("unfilled placeholders: " + ", ".join(left))
html = html.replace("__READER__", rd(args.reader))   # last: reader is plain JS
open(args.out, "w", encoding="utf-8").write(html)
print("Wrote", args.out, "| rules", len(view_rules), "| section filters", len(section_keep),
      "| registry skus", len(registry.get("skus", {})), "| aliases", len(aliases.get("aliases", {})))
