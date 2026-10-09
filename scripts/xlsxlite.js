/* xlsxlite — dependency-free reader for the CPQ Quote tab.
   Exposes readQuote(base64) -> { headerRow, rows:[{r, A,B,C,E,F,G}] }.
   Works in the browser and in Node (no zlib). */
(function (root) {
  // ---- base64 -> Uint8Array ----
  function b64ToBytes(b64) {
    if (typeof atob === 'function') {
      const bin = atob(b64); const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, 'base64')); // Node fallback for testing
  }

  // ---- tiny raw-DEFLATE inflate (tinf, public domain, ported) ----
  function Tree() { this.table = new Uint16Array(16); this.trans = new Uint16Array(288); }
  function Data(src, dst) {
    this.s = src; this.i = 0; this.t = 0; this.bitcount = 0;
    this.dest = dst; this.destLen = 0;
    this.ltree = new Tree(); this.dtree = new Tree();
  }
  const sltree = new Tree(), sdtree = new Tree();
  const length_bits = new Uint8Array(30), length_base = new Uint16Array(30);
  const dist_bits = new Uint8Array(30), dist_base = new Uint16Array(30);
  const clcidx = new Uint8Array([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]);
  const code_tree = new Tree(), lengths = new Uint8Array(288 + 32);

  function tinf_build_bits_base(bits, base, delta, first) {
    let i, sum;
    for (i = 0; i < delta; ++i) bits[i] = 0;
    for (i = 0; i < 30 - delta; ++i) bits[i + delta] = (i / delta) | 0;
    for (sum = first, i = 0; i < 30; ++i) { base[i] = sum; sum += 1 << bits[i]; }
  }
  function tinf_build_fixed_trees(lt, dt) {
    let i;
    for (i = 0; i < 7; ++i) lt.table[i] = 0;
    lt.table[7] = 24; lt.table[8] = 152; lt.table[9] = 112;
    for (i = 0; i < 24; ++i) lt.trans[i] = 256 + i;
    for (i = 0; i < 144; ++i) lt.trans[24 + i] = i;
    for (i = 0; i < 8; ++i) lt.trans[24 + 144 + i] = 280 + i;
    for (i = 0; i < 112; ++i) lt.trans[24 + 144 + 8 + i] = 144 + i;
    for (i = 0; i < 5; ++i) dt.table[i] = 0;
    dt.table[5] = 32;
    for (i = 0; i < 32; ++i) dt.trans[i] = i;
  }
  function tinf_build_tree(t, lengthsArr, off, num) {
    let i;
    for (i = 0; i < 16; ++i) t.table[i] = 0;
    for (i = 0; i < num; ++i) t.table[lengthsArr[off + i]]++;   // counts per length
    t.table[0] = 0;
    const offs = new Uint16Array(16);
    let sum = 0;
    for (i = 0; i < 16; ++i) { offs[i] = sum; sum += t.table[i]; }  // offsets from counts
    for (i = 0; i < num; ++i) if (lengthsArr[off + i]) t.trans[offs[lengthsArr[off + i]]++] = i;
  }
  function tinf_getbit(d) {
    if (!d.bitcount--) { d.t = d.s[d.i++]; d.bitcount = 7; }
    const bit = d.t & 1; d.t >>>= 1; return bit;
  }
  function tinf_read_bits(d, num, base) {
    if (!num) return base;
    while (d.bitcount < 24) { d.t |= d.s[d.i++] << d.bitcount; d.bitcount += 8; }
    const val = d.t & (0xffff >>> (16 - num)); d.t >>>= num; d.bitcount -= num;
    return val + base;
  }
  function tinf_decode_symbol(d, t) {
    while (d.bitcount < 24) { d.t |= d.s[d.i++] << d.bitcount; d.bitcount += 8; }
    let sum = 0, cur = 0, len = 0, tag = d.t;
    do { cur = 2 * cur + (tag & 1); tag >>>= 1; ++len; sum += t.table[len]; cur -= t.table[len]; } while (cur >= 0);
    d.t = tag; d.bitcount -= len;
    return t.trans[sum + cur];
  }
  function tinf_decode_trees(d, lt, dt) {
    let hlit, hdist, hclen, i, num, length;
    hlit = tinf_read_bits(d, 5, 257); hdist = tinf_read_bits(d, 5, 1); hclen = tinf_read_bits(d, 4, 4);
    for (i = 0; i < 19; ++i) lengths[i] = 0;
    for (i = 0; i < hclen; ++i) lengths[clcidx[i]] = tinf_read_bits(d, 3, 0);
    tinf_build_tree(code_tree, lengths, 0, 19);
    for (num = 0; num < hlit + hdist;) {
      const sym = tinf_decode_symbol(d, code_tree);
      switch (sym) {
        case 16: { const prev = lengths[num - 1]; for (length = tinf_read_bits(d, 2, 3); length; --length) lengths[num++] = prev; break; }
        case 17: for (length = tinf_read_bits(d, 3, 3); length; --length) lengths[num++] = 0; break;
        case 18: for (length = tinf_read_bits(d, 7, 11); length; --length) lengths[num++] = 0; break;
        default: lengths[num++] = sym; break;
      }
    }
    tinf_build_tree(lt, lengths, 0, hlit);
    tinf_build_tree(dt, lengths, hlit, hdist);
  }
  function tinf_inflate_block_data(d, lt, dt) {
    for (;;) {
      let sym = tinf_decode_symbol(d, lt);
      if (sym === 256) return true;
      if (sym < 256) { d.dest[d.destLen++] = sym; }
      else {
        let length, dist, offs, i;
        sym -= 257;
        length = tinf_read_bits(d, length_bits[sym], length_base[sym]);
        dist = tinf_decode_symbol(d, dt);
        offs = d.destLen - tinf_read_bits(d, dist_bits[dist], dist_base[dist]);
        for (i = offs; i < offs + length; ++i) d.dest[d.destLen++] = d.dest[i];
      }
    }
  }
  function tinf_inflate_uncompressed_block(d) {
    let length, invlength;
    while (d.bitcount > 8) { d.i--; d.bitcount -= 8; }
    length = d.s[d.i + 1]; length = 256 * length + d.s[d.i]; d.i += 4;
    for (let i = length; i; --i) d.dest[d.destLen++] = d.s[d.i++];
    d.bitcount = 0; return true;
  }
  function tinf_uncompress(source, dest) {
    const d = new Data(source, dest); let bfinal, btype, res;
    do {
      bfinal = tinf_getbit(d); btype = tinf_read_bits(d, 2, 0);
      if (btype === 0) res = tinf_inflate_uncompressed_block(d);
      else if (btype === 1) res = tinf_inflate_block_data(d, sltree, sdtree);
      else if (btype === 2) { tinf_decode_trees(d, d.ltree, d.dtree); res = tinf_inflate_block_data(d, d.ltree, d.dtree); }
      else throw new Error('inflate: bad btype');
      if (res !== true) throw new Error('inflate error');
    } while (!bfinal);
    return d.dest.subarray(0, d.destLen);
  }
  // init fixed tables
  tinf_build_fixed_trees(sltree, sdtree);
  tinf_build_bits_base(length_bits, length_base, 4, 3);
  tinf_build_bits_base(dist_bits, dist_base, 2, 1);
  length_bits[28] = 0; length_base[28] = 258;

  // ---- ZIP (central directory) ----
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function unzip(bytes) {
    // find End of Central Directory
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0; i--) { if (u32(bytes, i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('EOCD not found');
    const cdCount = u16(bytes, eocd + 10);
    let off = u32(bytes, eocd + 16);
    const files = {};
    for (let n = 0; n < cdCount; n++) {
      if (u32(bytes, off) !== 0x02014b50) break;
      const method = u16(bytes, off + 10);
      const compSize = u32(bytes, off + 20);
      const nameLen = u16(bytes, off + 28);
      const extraLen = u16(bytes, off + 30);
      const commentLen = u16(bytes, off + 32);
      const localOff = u32(bytes, off + 42);
      const name = utf8(bytes.subarray(off + 46, off + 46 + nameLen));
      // local header to find data start
      const lnameLen = u16(bytes, localOff + 26);
      const lextraLen = u16(bytes, localOff + 28);
      const dataStart = localOff + 30 + lnameLen + lextraLen;
      const comp = bytes.subarray(dataStart, dataStart + compSize);
      files[name] = { method, comp };
      off += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }
  function utf8(b) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(b);
    return Buffer.from(b).toString('utf8');
  }
  function inflateEntry(f) {
    if (f.method === 0) return utf8(f.comp);
    // decompressed size unknown; grow buffer generously
    const out = new Uint8Array(Math.max(1 << 20, f.comp.length * 12));
    const res = tinf_uncompress(f.comp, out);
    return utf8(res);
  }

  // ---- XLSX Quote parsing ----
  function colOf(ref) { return ref.replace(/[0-9]+/g, ''); }
  function rowOf(ref) { return parseInt(ref.replace(/[^0-9]/g, ''), 10); }

  function readQuote(base64) {
    const bytes = b64ToBytes(base64);
    const files = unzip(bytes);
    // shared strings
    const sst = [];
    if (files['xl/sharedStrings.xml']) {
      const xml = inflateEntry(files['xl/sharedStrings.xml']);
      const re = /<si>([\s\S]*?)<\/si>/g; let m;
      while ((m = re.exec(xml))) {
        const parts = m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
        sst.push(parts.map(t => t.replace(/<[^>]+>/g, '')).join('').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#10;/g,'\n'));
      }
    }
    // workbook -> sheet name to rId
    const wb = inflateEntry(files['xl/workbook.xml']);
    const rels = inflateEntry(files['xl/_rels/workbook.xml.rels']);
    const relMap = {};
    (rels.match(/<Relationship[^>]*>/g) || []).forEach(r => {
      const id = (r.match(/Id="([^"]+)"/) || [])[1];
      const tgt = (r.match(/Target="([^"]+)"/) || [])[1];
      if (id && tgt) relMap[id] = tgt.replace(/^\/?xl\//, '').replace(/^worksheets/, 'worksheets');
    });
    let quoteTarget = null;
    (wb.match(/<sheet[^>]*>/g) || []).forEach(s => {
      const name = (s.match(/name="([^"]+)"/) || [])[1];
      const rid = (s.match(/r:id="([^"]+)"/) || [])[1];
      if (name === 'Quote' && rid && relMap[rid]) quoteTarget = 'xl/' + relMap[rid].replace(/^xl\//, '');
    });
    if (!quoteTarget) {
      // fallback: first worksheet
      quoteTarget = Object.keys(files).find(k => /^xl\/worksheets\/sheet1\.xml$/.test(k));
    }
    const sheetXml = inflateEntry(files[quoteTarget]);
    // parse rows/cells for cols A,B,C,E,F,G
    const wanted = { A:1, B:1, C:1, E:1, F:1, G:1 };
    const rows = {};
    // Match a cell that is either self-closing (<c .../>) or has a body (<c ...>...</c>).
    // The attrs group is non-greedy and the self-closing branch is checked first, so an
    // empty self-closing cell (e.g. <c r="B25" s="5"/>) is NOT merged with the following
    // cell -- otherwise the next cell's value would be silently dropped.
    const cellRe = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m;
    while ((m = cellRe.exec(sheetXml))) {
      const ref = m[1]; const attrs = m[2] || ''; const inner = m[3] || '';
      const col = colOf(ref); if (!wanted[col]) continue;
      const r = rowOf(ref);
      let val = '';
      const tMatch = attrs.match(/t="([^"]+)"/); const type = tMatch ? tMatch[1] : 'n';
      if (type === 's') {
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v != null) val = sst[parseInt(v, 10)] || '';
      } else if (type === 'inlineStr' || type === 'str') {
        val = (inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || inner.match(/<v>([\s\S]*?)<\/v>/) || [,''])[1].replace(/<[^>]+>/g, '');
      } else {
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        val = v != null ? v : '';
      }
      (rows[r] = rows[r] || {})[col] = val;
    }
    return rows; // {rowNum: {A,B,C,E,F,G}}
  }

  const api = { readQuote, b64ToBytes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.xlsxlite = api;
})(typeof self !== 'undefined' ? self : this);
