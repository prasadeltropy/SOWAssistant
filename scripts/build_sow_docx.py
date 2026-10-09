#!/usr/bin/env python3
"""
Fill the Eltropy SOW Word template (exported .docx) in place, preserving fonts
(Trebuchet MS), heading styles, the live Table-of-Contents field, and all table
formatting. Only the dynamic parts are populated from the CPQ extraction:
  * customer name (Title + the Presented-To defining cell)
  * Proposed Solutions table (one row per selected solution / integration)
  * Phase 1 "SKUs to be Implemented" (Solutions / Integrations bullet lists)

Everything the Implementation Manager fills (Phases 2-3, Business Problems,
Risks, Out of Scope) is left exactly as in the template.

Usage:
  python3 build_sow_docx.py --data sow_data.json --template template.docx --out sow.docx
"""
import argparse, json, copy, re, os
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

W_P = qn('w:p'); W_R = qn('w:r'); W_T = qn('w:t'); W_PPR = qn('w:pPr')
W_NUMPR = qn('w:numPr')


def set_para_text(p_el, text):
    """Set a paragraph element's text, keeping the first run's formatting."""
    runs = p_el.findall(W_R)
    if runs:
        first = runs[0]
        for t in first.findall(W_T):
            first.remove(t)
        t = OxmlElement('w:t'); t.set(qn('xml:space'), 'preserve'); t.text = text
        first.append(t)
        for extra in runs[1:]:
            p_el.remove(extra)
    else:
        r = OxmlElement('w:r'); t = OxmlElement('w:t')
        t.set(qn('xml:space'), 'preserve'); t.text = text
        r.append(t); p_el.append(r)
    return p_el


def bullet_template_in_cell(tc):
    """Return a deep copy of the first bulleted (numPr) paragraph in a tc, or None."""
    for p in tc.findall(W_P):
        ppr = p.find(W_PPR)
        if ppr is not None and ppr.find(W_NUMPR) is not None:
            return copy.deepcopy(p)
    return None


def plain_template_in_cell(tc):
    for p in tc.findall(W_P):
        return copy.deepcopy(p)
    return None


def fill_solution_tc(tcs, name, features, notes, fvm):
    """tcs = list of 3 <w:tc> (name | features | first value moment)."""
    # name cell
    p = tcs[0].findall(W_P)[0]
    set_para_text(p, name)
    # features cell: replace bullets with one per feature (+ notes as 'Note:' bullets)
    tc = tcs[1]
    tmpl = bullet_template_in_cell(tc)
    if tmpl is None:
        tmpl = plain_template_in_cell(tc)
    for p in tc.findall(W_P):
        tc.remove(p)
    items = list(features) + [("Note: " + n) for n in (notes or [])]
    if not items:
        items = ["[Insert from Product Marketing Descriptions]"]
    for it in items:
        np = copy.deepcopy(tmpl); set_para_text(np, it); tc.append(np)
    # first value moment cell
    p = tcs[2].findall(W_P)[0]
    set_para_text(p, fvm or "")


def fill_proposed_solutions(table, solutions, integrations):
    rows = table.rows
    # rows: 0 header, 1 sol, 2 sol, 3 integ-header, 4 integ, 5 customization
    sol_tr_template = copy.deepcopy(rows[1]._tr)
    int_tr_template = copy.deepcopy(rows[4]._tr)
    integ_header_tr = rows[3]._tr
    customization_tr = rows[5]._tr

    # remove the 2nd placeholder solution row (row index 2)
    rows[2]._tr.getparent().remove(rows[2]._tr)

    # --- solutions: fill row 1, then insert clones before integ header ---
    def tcs_of(tr):
        return tr.findall(qn('w:tc'))
    if solutions:
        fill_solution_tc(tcs_of(rows[1]._tr), _n(solutions[0]),
                         solutions[0]["features"], solutions[0].get("notes"),
                         _fvm(solutions[0]))
        anchor = rows[1]._tr
        for s in solutions[1:]:
            new_tr = copy.deepcopy(sol_tr_template)
            fill_solution_tc(tcs_of(new_tr), _n(s), s["features"], s.get("notes"), _fvm(s))
            anchor.addnext(new_tr); anchor = new_tr
    # --- integrations: fill row 4, then insert clones before customization row ---
    # after possible deletions, re-fetch the integration template row element
    if integrations:
        # locate the current integration row: it's the one right after integ header
        int_row = integ_header_tr.getnext()
        fill_solution_tc(int_row.findall(qn('w:tc')), _n(integrations[0]),
                         integrations[0]["features"], integrations[0].get("notes"),
                         _fvm(integrations[0]))
        anchor = int_row
        for s in integrations[1:]:
            new_tr = copy.deepcopy(int_tr_template)
            fill_solution_tc(new_tr.findall(qn('w:tc')), _n(s), s["features"],
                             s.get("notes"), _fvm(s))
            anchor.addnext(new_tr); anchor = new_tr


def set_cell_text(cell, text):
    """Replace a cell's content with a single run of text, keeping paragraph style."""
    p = cell.paragraphs[0]
    for r in list(p.runs):
        r.text = ""
    if p.runs:
        p.runs[0].text = text
    else:
        p.add_run(text)
    # drop any extra paragraphs
    for extra in cell.paragraphs[1:]:
        extra._p.getparent().remove(extra._p)


def set_para_full(p, text):
    """Replace a paragraph's whole text, keeping the first run's formatting."""
    if not text:
        return
    if p.runs:
        p.runs[0].text = text
        for r in p.runs[1:]:
            r.text = ""
    else:
        p.add_run(text)


def fill_people(doc, people):
    """Populate the People section. The current template ("04. Summary SOW") uses a
    labeled table (Role | Name | Email | Phone) with the rows 'Customer Business
    Sponsor', 'Eltropy Account Executive' and 'Eltropy Solutions Engineer'. Older
    templates used placeholder lines in the Presented-To / Presented-By cells. Both
    layouts are handled. Business Sponsor <- Account Project Sponsor, AE <- Owner,
    SE <- SE of Record (resolved to a User by the Phase Builder)."""
    if not people or not doc.tables:
        return
    pc = people.get("primary_contact") or {}
    ow = people.get("owner") or {}
    se = people.get("se") or {}
    t = doc.tables[0]
    header = [c.text.strip().lower() for c in t.rows[0].cells] if t.rows else []
    is_grid = (header[:2] == ["role", "name"]) or ("name" in header and "email" in header)
    if is_grid:
        role_map = {
            "customer business sponsor": pc,
            "eltropy account executive": ow,
            "eltropy solutions engineer": se,
        }
        for row in t.rows:
            person = role_map.get(row.cells[0].text.strip().lower())
            if person is None:
                continue
            cells = row.cells
            if len(cells) >= 2 and person.get("name"):
                set_cell_text(cells[1], person["name"])
            if len(cells) >= 3 and person.get("email"):
                set_cell_text(cells[2], person["email"])
            if len(cells) >= 4 and person.get("phone"):
                set_cell_text(cells[3], person["phone"])
        return
    # ---- legacy placeholder layout ----
    to_cell = t.rows[1].cells[0]
    by_cell = t.rows[1].cells[1]

    def setp(cell, placeholder, value):
        for p in cell.paragraphs:
            if p.text.strip() == placeholder:
                set_para_full(p, value)
                return

    setp(to_cell, "Business Sponsor", pc.get("name"))
    setp(to_cell, "Business Sponsor Email", pc.get("email"))
    setp(to_cell, "Business Sponsor Phone", pc.get("phone"))
    setp(by_cell, "Account Executive", ow.get("name"))
    setp(by_cell, "AE Email", ow.get("email"))
    setp(by_cell, "AE Phone Number", ow.get("phone"))
    setp(by_cell, "Solution Engineer", se.get("name"))
    setp(by_cell, "SE Email", se.get("email"))
    setp(by_cell, "SE Phone Number", se.get("phone"))


def fill_tracking_id(doc, opp):
    """Put the Salesforce Opportunity ID on the 'Eltropy Tracking Id:' line under
    Proposed Solutions. Returns True if the placeholder line was found."""
    opp_id = (opp or {}).get("id") or ""
    if not opp_id:
        return False
    for p in doc.paragraphs:
        if p.text.strip().lower().startswith("eltropy tracking id"):
            if p.runs:
                p.runs[0].text = "Eltropy Tracking Id: " + opp_id
                for r in p.runs[1:]:
                    r.text = ""
            else:
                p.add_run("Eltropy Tracking Id: " + opp_id)
            return True
    return False


def fill_approver_name(doc, name):
    """Set the page-1 'Approver Name:' line (in the Approved By table) to the SE name."""
    if not name:
        return False
    for t in doc.tables:
        for row in t.rows:
            for c in row.cells:
                for p in c.paragraphs:
                    if p.text.strip().lower().startswith("approver name"):
                        if p.runs:
                            p.runs[0].text = "Approver Name: " + name
                            for r in p.runs[1:]:
                                r.text = ""
                        else:
                            p.add_run("Approver Name: " + name)
                        return True
    return False


def _header_text(t):
    if not t.rows:
        return ""
    return " | ".join(c.text.strip().lower() for c in t.rows[0].cells)


def find_table(doc, *musts):
    """First table whose header row contains all `musts` substrings (case-insensitive)."""
    for t in doc.tables:
        h = _header_text(t)
        if all(m in h for m in musts):
            return t
    return None


def fill_signature(doc, today):
    """Eltropy signature table (its own single-column table headed 'Eltropy'; older templates
    used a combined 'Company | Eltropy' table). The Eltropy signatory Name/Title are HARDCODED
    in the template (Prasad Shrotri) and are not changed. Only the Eltropy-side Date is set to
    today. The Company signature name is handled by the doc-wide 'Company' -> customer rename."""
    elt_cell = None
    for tb in doc.tables:
        if _header_text(tb).strip() == "eltropy" and len(tb.rows) >= 2:
            elt_cell = tb.rows[1].cells[0]
            break
    if elt_cell is None:
        t = find_table(doc, "company", "eltropy")
        if t is not None and len(t.rows) >= 2:
            elt_cell = t.rows[1].cells[1]
    if elt_cell is None:
        return False
    for p in elt_cell.paragraphs:
        if today and p.text.strip().lower().startswith("date:"):
            if p.runs:
                p.runs[0].text = "Date: " + today
                for r in p.runs[1:]:
                    r.text = ""
    return True


def replace_company(doc, cust):
    """Prefill the customer name everywhere the template uses the 'Company' placeholder
    (Title, body sentences, and the signature block's Company header)."""
    def walk_paras(paras):
        for p in paras:
            if "Company" in p.text:
                replace_in_paragraph(p, "Company", cust)
    def walk_container(c):
        walk_paras(c.paragraphs)
        for t in c.tables:
            for row in t.rows:
                for cell in row.cells:
                    walk_container(cell)
    walk_container(doc)
    for sec in doc.sections:
        walk_paras(sec.header.paragraphs)
        walk_paras(sec.footer.paragraphs)


def fill_business_outcomes(doc, pairs):
    """Fill the 'Client Business Problems and Desired Outcomes' table (index 2):
    header row + N rows of (problem/area, outcome)."""
    if not pairs:
        return
    table = find_table(doc, "business problems") or find_table(doc, "outcomes") or doc.tables[2]
    data_rows = table.rows[1:]  # row 0 is the header
    for i, pair in enumerate(pairs):
        prob = (pair.get("problem") or "").strip() if isinstance(pair, dict) else str(pair[0])
        outc = (pair.get("outcome") or "").strip() if isinstance(pair, dict) else str(pair[1])
        row = data_rows[i] if i < len(data_rows) else table.add_row()
        set_cell_text(row.cells[0], prob)
        set_cell_text(row.cells[1], outc)


def fill_phase_cell(cell, items):
    """Keep the 'Solutions:'/'Integrations:' label paragraph; replace the
    placeholder bullet(s) with one bullet per item."""
    tc = cell._tc
    paras = tc.findall(W_P)
    if not paras:
        return
    tmpl = bullet_template_in_cell(tc)
    if tmpl is None:
        tmpl = copy.deepcopy(paras[-1])
    label = paras[0]
    for p in paras[1:]:
        tc.remove(p)
    if not items:
        items = ["[Insert item]"]
    for it in items:
        np = copy.deepcopy(tmpl); set_para_text(np, it); tc.append(np)


def _n(item):
    return item.get("matched_name") or item["name"]


def _fvm(item):
    return item.get("first_value_moment") or ""


def replace_in_paragraph(p, old, new):
    """Replace text across a paragraph's runs (simple whole-run join approach)."""
    full = "".join(r.text or "" for r in p.runs)
    if old in full:
        # set entire text on first run, clear others -- keeps first run's font
        newfull = full.replace(old, new)
        if p.runs:
            p.runs[0].text = newfull
            for r in p.runs[1:]:
                r.text = ""


def _set_run_font(run, font):
    run.font.name = font
    rpr = run._r.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts'); rpr.insert(0, rfonts)
    for a in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
        rfonts.set(qn(a), font)
    # remove theme references so they can't override the explicit font
    for a in ('w:asciiTheme', 'w:hAnsiTheme', 'w:cstheme', 'w:eastAsiaTheme'):
        if rfonts.get(qn(a)) is not None:
            del rfonts.attrib[qn(a)]


def _iter_cells(table):
    for row in table.rows:
        for cell in row.cells:
            yield cell


def normalize_font(doc, font="Trebuchet MS"):
    """Force one explicit font across the whole document so no viewer falls back
    to the theme (Calibri) font. Covers body, tables (recursively), header/footer,
    the styles, docDefaults and the theme part."""
    def do_paragraphs(paras):
        for p in paras:
            for r in p.runs:
                _set_run_font(r, font)
    def do_container(container):
        do_paragraphs(container.paragraphs)
        for t in container.tables:
            for cell in _iter_cells(t):
                do_container(cell)
    do_container(doc)
    for sec in doc.sections:
        do_paragraphs(sec.header.paragraphs)
        do_paragraphs(sec.footer.paragraphs)
    # styles
    for st in doc.styles:
        try:
            if st.font is not None:
                st.font.name = font
        except Exception:
            pass
    # docDefaults + theme (via XML parts)
    try:
        el = doc.styles.element
        rpr_def = el.find(qn('w:docDefaults'))
        if rpr_def is not None:
            for rfonts in rpr_def.iter(qn('w:rFonts')):
                for a in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
                    rfonts.set(qn(a), font)
    except Exception:
        pass
    _set_theme_font(doc, font)


def _set_theme_font(doc, font):
    """Rewrite the theme's major & minor Latin typefaces to `font`."""
    try:
        from docx.oxml.ns import nsmap
        theme_part = None
        for rel in doc.part.rels.values():
            if 'theme' in rel.reltype:
                theme_part = rel.target_part; break
        if theme_part is None:
            return
        import re
        xml = theme_part.blob.decode('utf-8')
        xml = re.sub(r'(<a:majorFont>\s*<a:latin typeface=")[^"]*(")',
                     r'\g<1>' + font + r'\g<2>', xml)
        xml = re.sub(r'(<a:minorFont>\s*<a:latin typeface=")[^"]*(")',
                     r'\g<1>' + font + r'\g<2>', xml)
        theme_part._blob = xml.encode('utf-8')
    except Exception:
        pass


def is_integration(item):
    cat = (item.get("category") or "").lower()
    if "integration" in cat:
        return True
    return "integration" in _n(item).lower()


def set_after_colon(p, value):
    if value:
        p.add_run(str(value))


def fill_phase_dates(doc, phase_map):
    """phase_map: {1:{'start','end','pm'}, ...}. Fills the 9 label paragraphs
    (3 per phase) that precede the phase tables, in document order."""
    labels = {"Expected Start Date": "start", "Expected End Date": "end",
              "Project Manager Name": "pm"}
    hits = []  # (paragraph, field)
    for p in doc.paragraphs:
        for lbl, field in labels.items():
            if p.text.strip().startswith(lbl):
                hits.append((p, field))
                break
    # group into phases of 3 in order
    for i in range(0, len(hits), 3):
        phase_no = i // 3 + 1
        info = phase_map.get(phase_no, {})
        for p, field in hits[i:i + 3]:
            set_after_colon(p, info.get(field, ""))


def _p_style(el):
    ppr = el.find(qn('w:pPr'))
    if ppr is not None:
        ps = ppr.find(qn('w:pStyle'))
        if ps is not None:
            return ps.get(qn('w:val'))
    return None


def _p_text(el):
    return ''.join(t.text or '' for t in el.iter(qn('w:t')))


def get_phase_blocks(doc):
    """Return (body, [block,...]) where each block is the list of body elements
    from a 'Phase N' Heading 3 up to (but not including) the next phase heading
    or the 'Out of Scope' heading."""
    body = doc.element.body
    children = list(body.iterchildren())

    def is_phase_h3(ch):
        return (ch.tag == qn('w:p') and _p_style(ch) == 'Heading3'
                and _p_text(ch).strip().lower().startswith('phase'))

    def is_out_of_scope(ch):
        return ch.tag == qn('w:p') and _p_text(ch).strip().lower() == 'out of scope'

    blocks = []
    idx, n = 0, len(children)
    while idx < n:
        if is_phase_h3(children[idx]):
            block = [children[idx]]; idx += 1
            while idx < n and not is_phase_h3(children[idx]) and not is_out_of_scope(children[idx]):
                block.append(children[idx]); idx += 1
            blocks.append(block)
        else:
            idx += 1
    return body, blocks


def set_phase_count(doc, nphases):
    """Grow or shrink the number of Phase blocks to `nphases`, renumbering them.
    Returns the final list of blocks (each a list of body elements)."""
    nphases = max(1, int(nphases))
    body, blocks = get_phase_blocks(doc)
    cur = len(blocks)
    if nphases < cur:
        for blk in blocks[nphases:]:
            for el in blk:
                body.remove(el)
        blocks = blocks[:nphases]
    elif nphases > cur:
        last = blocks[-1]
        anchor = last[-1]
        for _ in range(nphases - cur):
            newblk = [copy.deepcopy(el) for el in last]
            for el in newblk:
                anchor.addnext(el); anchor = el
            blocks.append(newblk)
    # renumber every block 1..N
    for i, blk in enumerate(blocks, start=1):
        for el in blk:
            for t in el.iter(qn('w:t')):
                if t.text and 'Phase' in t.text:
                    t.text = re.sub(r'Phase\s*\d+', 'Phase ' + str(i), t.text)
    return blocks


def block_table(doc, block):
    for el in block:
        if el.tag == qn('w:tbl'):
            return Table(el, doc)
    return None


def fill_block_dates(doc, block, info):
    labels = {"Expected Start Date": "start", "Expected End Date": "end",
              "Project Manager Name": "pm"}
    for el in block:
        if el.tag != qn('w:p'):
            continue
        txt = _p_text(el).strip()
        for lbl, field in labels.items():
            if txt.startswith(lbl) and info.get(field):
                Paragraph(el, doc).add_run(str(info[field]))
                break


# ---------------------------------------------------------------------------
# Rule-driven Solution Outline injection
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_RULES = os.path.join(_HERE, "..", "reference", "rules.json")


def load_rules(path):
    """Load the `rules` array from a rules.json; return [] on any problem."""
    try:
        return json.load(open(path, encoding="utf-8")).get("rules", [])
    except Exception as e:
        print("WARN: could not load rules:", e)
        return []


def _onorm(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())


def _tok_match(token, name):
    a, b = _onorm(token), _onorm(name)
    return bool(a) and bool(b) and (a in b or b in a)


def _rule_tokens(rule):
    toks = rule.get("match") or [rule.get("sku", "")]
    return [t for t in toks if t]


def _rule_matches_name(rule, name):
    return any(_tok_match(t, name) for t in _rule_tokens(rule))


def _body_bullet_template(doc):
    """Deep-copy a multi-level body bullet paragraph (the numId=5 Kickoff list)
    to clone for Solution Outline bullets. Returns None if none is found."""
    for el in doc.element.body.iter(qn('w:p')):
        ppr = el.find(qn('w:pPr'))
        if ppr is None:
            continue
        numpr = ppr.find(qn('w:numPr'))
        if numpr is None:
            continue
        numid = numpr.find(qn('w:numId'))
        if numid is not None and numid.get(qn('w:val')) == '5':
            return copy.deepcopy(el)
    return None


def _set_bullet_level(p_el, level):
    ppr = p_el.find(qn('w:pPr'))
    numpr = ppr.find(qn('w:numPr'))
    ilvl = numpr.find(qn('w:ilvl'))
    if ilvl is None:
        ilvl = OxmlElement('w:ilvl')
        numpr.insert(0, ilvl)
    ilvl.set(qn('w:val'), str(int(level)))


def _make_outline_bullet(tmpl, text, level):
    np = copy.deepcopy(tmpl)
    _set_bullet_level(np, level)
    set_para_text(np, text)
    return np


def _find_outline_heading(doc, phase_n):
    want = "solution outline - phase %d" % phase_n
    for el in doc.element.body.iter(qn('w:p')):
        if _p_style(el) == 'Heading4' and _p_text(el).strip().lower() == want:
            return el
    return None


def _clear_section_body(doc, heading):
    """Remove placeholder paragraphs between `heading` and the next heading."""
    body = doc.element.body
    headings = ('Heading1', 'Heading2', 'Heading3', 'Heading4')
    sib = heading.getnext()
    while sib is not None and sib.tag == qn('w:p') and _p_style(sib) not in headings:
        nxt = sib.getnext()
        body.remove(sib)
        sib = nxt


def _is_solution_item(s):
    cat = (s.get("category") or "").lower()
    if cat:
        return cat == "solutions"
    return (not is_integration(s)) and ("platform" not in _n(s).lower())


def inject_solution_outlines(doc, phase_skus, rules, font="Trebuchet MS"):
    """For each `solution_outline` rule that fires, insert its bullet outline
    under the matching phase's 'Solution Outline - Phase N' heading.

    phase_skus: {phase_number: [ {name, category}, ... ]}.
    `when: sole_solution` requires the matched SKU to be the ONLY
    Solutions-category SKU across the whole deal. The outline is placed under the
    earliest phase that contains the matched SKU.
    """
    outline_rules = [r for r in (rules or []) if r.get("type") == "solution_outline"]
    if not outline_rules:
        return 0
    tmpl = _body_bullet_template(doc)
    if tmpl is None:
        return 0
    all_items = [s for skus in phase_skus.values() for s in skus]
    solution_items = [s for s in all_items if _is_solution_item(s)]

    inserted = 0
    for rule in outline_rules:
        match_phases = [pn for pn, skus in phase_skus.items()
                        if any(_rule_matches_name(rule, _n(s)) for s in skus)]
        if not match_phases:
            continue
        when = (rule.get("when") or "present").lower()
        if when == "sole_solution":
            if not (len(solution_items) == 1
                    and _rule_matches_name(rule, _n(solution_items[0]))):
                continue
        target = min(match_phases)
        heading = _find_outline_heading(doc, target)
        if heading is None:
            continue
        _clear_section_body(doc, heading)
        anchor = heading
        for item in rule.get("outline", []):
            if isinstance(item, str):
                lvl, text = 0, item
            else:
                lvl, text = int(item.get("level", 0)), (item.get("text") or "")
            np = _make_outline_bullet(tmpl, text, lvl)
            anchor.addnext(np)
            anchor = np
            inserted += 1
    return inserted


def run_phase_config(cfg, template, out, font="Trebuchet MS", rules=None):
    cust = cfg.get("customer") or "[Client]"
    phases = {p["phase"]: p for p in cfg.get("phases", [])}
    # union of all SKUs across phases (dedup by name, preserve first appearance)
    seen = set(); all_items = []
    for pn in sorted(phases):
        for s in phases[pn]["skus"]:
            if _n(s) not in seen:
                seen.add(_n(s)); all_items.append(s)
    solutions = [s for s in all_items if not is_integration(s)]
    integrations = [s for s in all_items if is_integration(s)]

    doc = Document(template)
    for p in doc.paragraphs:
        if p.style.name == "Title" and "Company" in p.text:
            replace_in_paragraph(p, "Company", cust); break
    dp = doc.tables[0].rows[1].cells[0].paragraphs[0]
    if dp.text.strip().startswith("Company"):
        replace_in_paragraph(dp, "Company (", cust + " (")

    # Tag the SOW with the Salesforce opportunity. Current template: the
    # "Eltropy Tracking Id:" line under Proposed Solutions. Fallback (older
    # template): add a row to the second table.
    opp = cfg.get("opportunity") or {}
    if opp.get("name") or opp.get("id"):
        if not fill_tracking_id(doc, opp):
            try:
                date_tbl = doc.tables[1]
                row = date_tbl.add_row()
                row.cells[0].paragraphs[0].add_run("Salesforce Opportunity").bold = True
                val = opp.get("name", "")
                if opp.get("id"):
                    val = (val + f"  ({opp['id']})").strip()
                row.cells[1].paragraphs[0].add_run(val)
            except Exception:
                pass

    fill_people(doc, cfg.get("people") or {})
    _se_name = ((cfg.get("people") or {}).get("se") or {}).get("name")
    fill_approver_name(doc, _se_name)  # legacy single-line 'Approver Name:' layout, if present
    import datetime as _dt
    fill_signature(doc, _dt.date.today().strftime("%m/%d/%Y"))
    replace_company(doc, cust)
    fill_business_outcomes(doc, cfg.get("business_outcomes") or [])

    fill_proposed_solutions(find_table(doc, "solutions", "features included") or doc.tables[3], solutions, integrations)

    # Adjust the number of Phase blocks to match the config, then fill each.
    nphases = max(phases.keys()) if phases else 1
    blocks = set_phase_count(doc, nphases)
    for i, block in enumerate(blocks, start=1):
        ph = phases.get(i, {"skus": []})
        fill_block_dates(doc, block, {"start": ph.get("start", ""),
                                      "end": ph.get("end", ""),
                                      "pm": ph.get("pm", "")})
        tbl = block_table(doc, block)
        if tbl is None:
            continue
        sol = [_n(s) for s in ph.get("skus", []) if not is_integration(s)]
        ints = [_n(s) for s in ph.get("skus", []) if is_integration(s)]
        fill_phase_cell(tbl.rows[1].cells[0], sol)
        fill_phase_cell(tbl.rows[2].cells[0], ints)

    inject_solution_outlines(doc, {pn: phases[pn].get("skus", []) for pn in phases}, rules, font)
    normalize_font(doc, font)
    doc.save(out)
    print(f"Saved {out}")
    print(f"Customer: {cust}")
    for pn in sorted(phases):
        ph = phases[pn]
        print(f"  Phase {pn}: {len(ph['skus'])} SKUs | {ph.get('start','')} -> {ph.get('end','')} | PM {ph.get('pm','')}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", help="sow_data.json (single-phase / Phase 1 only)")
    ap.add_argument("--phase-config", help="phase-config JSON from the phase builder")
    ap.add_argument("--template", required=True)
    ap.add_argument("--out", default="sow.docx")
    ap.add_argument("--font", default="Trebuchet MS")
    ap.add_argument("--rules", default=_DEFAULT_RULES,
                    help="rules.json for Solution Outline injection")
    args = ap.parse_args()
    rules = load_rules(args.rules)

    if args.phase_config:
        run_phase_config(json.load(open(args.phase_config)), args.template, args.out, args.font, rules)
        return

    data = json.load(open(args.data))
    cust = (data.get("customer", {}) or {}).get("name") or "[Client]"
    sections = data["sections"]
    solutions = sections.get("Platform", []) + sections.get("Solutions", []) + \
        sections.get("Bundles & Misc", [])
    integrations = sections.get("Integrations", [])

    doc = Document(args.template)
    for p in doc.paragraphs:
        if p.style.name == "Title" and "Company" in p.text:
            replace_in_paragraph(p, "Company", cust)
            break
    t0 = doc.tables[0]
    dp = t0.rows[1].cells[0].paragraphs[0]
    if dp.text.strip().startswith("Company"):
        replace_in_paragraph(dp, "Company (", cust + " (")

    fill_proposed_solutions(find_table(doc, "solutions", "features included") or doc.tables[3], solutions, integrations)
    phase1 = doc.tables[4]
    fill_phase_cell(phase1.rows[1].cells[0], [_n(s) for s in solutions])
    fill_phase_cell(phase1.rows[2].cells[0], [_n(s) for s in integrations])

    inject_solution_outlines(doc, {1: solutions + integrations}, rules, args.font)
    normalize_font(doc, args.font)
    doc.save(args.out)
    print(f"Saved {args.out}")
    print(f"Customer: {cust}")
    print(f"Solutions: {len(solutions)} | Integrations: {len(integrations)}")


if __name__ == "__main__":
    main()
