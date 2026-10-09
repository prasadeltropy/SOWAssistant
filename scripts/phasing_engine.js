/* ===================== AUTO-RECOMMEND PHASING ENGINE =====================
   Ported from reference/phasing-engine/phasing.ts. Data is injected at build
   time from reference/registry.json (SKU phasing data) and
   reference/registry_aliases.json (CPQ/product name -> registry key).
   Pure engine (no UI): the Phase Builder template calls buildInternalReg,
   apPairing, apTopo, apPack, apSchedule, apDepWarn and apVendor. */
const REG_DATA = __REGISTRY__;
const REGISTRY = REG_DATA.skus;
const AP_CONST = REG_DATA.constants || {};
const REG_ALIASES_RAW = (__REG_ALIASES__).aliases || {};
function apnorm(s){ return (s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
const REG_ALIASES = {};
Object.keys(REG_ALIASES_RAW).forEach(k=>{ REG_ALIASES[apnorm(k)] = REG_ALIASES_RAW[k]; });
const REG_KEYS = Object.keys(REGISTRY).map(k=>[apnorm(k),k]).sort((a,b)=>b[0].length-a[0].length);
// alias first (explicit null = no registry entry, no fuzzy), then exact key, then fuzzy
function apResolveKey(name){
  const n=apnorm(name); if(!n) return null;
  if(Object.prototype.hasOwnProperty.call(REG_ALIASES,n)) return REG_ALIASES[n] || null;
  for(const kv of REG_KEYS){ if(kv[0]===n) return kv[1]; }
  for(const kv of REG_KEYS){ if(kv[0].length>=4 && (n.indexOf(kv[0])>=0 || kv[0].indexOf(n)>=0)) return kv[1]; }
  return null;
}
function apCatDefault(cat){
  if(cat==="Platform") return {cap:2,weeks:10};
  if(cat==="Solutions") return {cap:2,weeks:8};
  if(cat==="Integrations") return {cap:2,weeks:6};
  if(cat==="Bundles & Misc") return {cap:0,weeks:2};
  return {cap:1,weeks:4};
}
function buildInternalReg(names, catOf){
  const s2r={}, r2s={};
  names.forEach(nm=>{ const rk=apResolveKey(nm); s2r[nm]=rk; if(rk && !r2s[rk]) r2s[rk]=nm; });
  let anchor = r2s["Text"] || null;
  if(!anchor){ for(const nm of names){ if(catOf(nm)==="Platform"){ anchor=nm; break; } } }
  const REG={};
  names.forEach(nm=>{
    const rk=s2r[nm], d=rk?REGISTRY[rk]:null, cat=catOf(nm)||"";
    if(d && r2s[rk]!==nm){
      // rider: another loaded SKU already carries this registry entry -> same slot, no extra load
      REG[nm]={capacity:0,weeks:d.weeks,requires:[],mustPairWith:[r2s[rk]],category:d.category,specialFlags:[],_regKey:rk,_rider:true};
      return;
    }
    let cap,weeks,req,pair,category,flags;
    if(d){
      cap=d.capacity; weeks=d.weeks; category=d.category; flags=d.specialFlags||[];
      req=(d.requires||[]).map(k=>r2s[k]).filter(x=>x && x!==nm && names.indexOf(x)>=0);
      pair=(d.mustPairWith||[]).map(k=>r2s[k]).filter(x=>x && x!==nm && names.indexOf(x)>=0);
    } else {
      const df=apCatDefault(cat); cap=df.cap; weeks=df.weeks; pair=[]; flags=[];
      category=cat;
      req=(anchor && anchor!==nm && cat!=="Platform")?[anchor]:[];
    }
    REG[nm]={capacity:cap,weeks:weeks,requires:req,mustPairWith:pair,category:category,specialFlags:flags,_regKey:rk};
  });
  return {REG,s2r,r2s};
}
function apAddW(d,w){ const x=new Date(d); x.setDate(x.getDate()+w*7); return x; }
function apPairing(reg, order){
  const set=new Set(order), adj={};
  order.forEach(s=>adj[s]=new Set());
  order.forEach(s=>{ (reg[s].mustPairWith||[]).forEach(p=>{ if(set.has(p)){ adj[s].add(p); adj[p].add(s); } }); });
  const vis=new Set(), groups=[];
  order.forEach(s=>{ if(vis.has(s))return; const g=[],q=[s]; vis.add(s);
    while(q.length){ const c=q.shift(); g.push(c); adj[c].forEach(n=>{ if(!vis.has(n)){ vis.add(n); q.push(n); } }); }
    groups.push(g); });
  return groups;
}
function apOptimize(reg, sg){
  const out=[], used=new Set();
  sg.forEach(g=>{ const b=g[0]; if(used.has(b))return; out.push(g); used.add(b);
    sg.forEach(og=>{ const on=og[0]; if(used.has(on))return; const os=reg[on];
      if(os && os.category==="Integrations" && os.requires && os.requires.indexOf(b)>=0){ out.push(og); used.add(on); } }); });
  return out;
}
function apTopo(reg, groups, active){
  const set=new Set(active), s2g={}; groups.forEach((g,i)=>g.forEach(s=>s2g[s]=i));
  const n=groups.length, ind=new Array(n).fill(0), adj=Array.from({length:n},()=>new Set());
  groups.forEach((g,gi)=>g.forEach(s=>{ (reg[s].requires||[]).forEach(d=>{ if(!set.has(d))return; const dg=s2g[d]; if(dg===gi)return; if(!adj[dg].has(gi)){ adj[dg].add(gi); ind[gi]++; } }); }));
  const q=[]; ind.forEach((d,i)=>{ if(d===0)q.push(i); }); const sorted=[];
  while(q.length){ const c=q.shift(); sorted.push(c); adj[c].forEach(nb=>{ ind[nb]--; if(ind[nb]===0)q.push(nb); }); }
  if(sorted.length!==n) throw new Error("Circular dependency in SKU graph.");
  return apOptimize(reg, sorted.map(i=>groups[i]));
}
function apPack(reg, ordered, active, CAP){
  const set=new Set(active), s2g={}; ordered.forEach((g,i)=>g.forEach(s=>s2g[s]=i));
  const phases=[], g2p={}, basePhase={};
  ordered.forEach((g,gi)=>{
    const gc=g.reduce((a,s)=>a+reg[s].capacity,0); let minP=1;
    g.forEach(s=>{ (reg[s].requires||[]).forEach(d=>{ if(!set.has(d))return; const dgi=s2g[d]; if(dgi===gi)return; const dp=g2p[dgi]; if(dp!==undefined)minP=Math.max(minP,dp); }); });
    const bn=g[0], bs=reg[bn];
    if(bs && bs.category==="Integrations" && bs.requires && bs.requires.length>0){ const pd=bs.requires[0]; if(basePhase[pd]!==undefined)minP=Math.max(minP,basePhase[pd]); }
    let placed=false;
    for(let i=0;i<phases.length;i++){ const pn=i+1; if(pn<minP)continue; const used=phases[i].reduce((a,s)=>a+reg[s].capacity,0);
      if(used+gc<=CAP){ phases[i].push.apply(phases[i],g); g2p[gi]=pn; if(!bs||bs.category!=="Integrations")basePhase[bn]=pn; placed=true; break; } }
    if(!placed){ phases.push(g.slice()); g2p[gi]=phases.length; if(!bs||bs.category!=="Integrations")basePhase[bn]=phases.length; }
  });
  return phases;
}
function apSlots(reg, phaseSkus, pairing, CONC){
  const pset=new Set(phaseSkus), s2p={};
  pairing.forEach(g=>{ const m=g.filter(s=>pset.has(s)); if(m.length)m.forEach(s=>s2p[s]=m); });
  const vis=new Set(), slots=[];
  phaseSkus.forEach(s=>{ if(vis.has(s))return; const slot=s2p[s]?s2p[s].slice():[s]; slot.forEach(x=>vis.add(x));
    let cap=slot.reduce((a,x)=>a+reg[x].capacity,0);
    phaseSkus.forEach(o=>{ if(vis.has(o))return; const oc=reg[o].capacity; if(cap+oc<=CONC){ slot.push(o); vis.add(o); cap+=oc; } });
    slots.push(slot); });
  while(slots.length>1 && slots[slots.length-1].length===1){ const s=slots[slots.length-1][0]; if(reg[s].capacity>=2)break; slots[slots.length-2].push(s); slots.pop(); }
  return slots;
}
function apDates(reg, phaseSkus, pairing, start, CONC){
  const slots=apSlots(reg,phaseSkus,pairing,CONC), dates={}; let cur=new Date(start);
  slots.forEach(slot=>{ const mw=Math.max.apply(null,slot.map(s=>reg[s].weeks)); const se=apAddW(cur,mw);
    slot.forEach(s=>{ const w=reg[s].weeks; const dep=slot.some(o=>o!==s && (reg[o].requires||[]).indexOf(s)>=0);
      if(dep) dates[s]={start:cur,end:apAddW(cur,w)}; else dates[s]={start:apAddW(se,-w),end:se}; });
    cur=se; });
  return {dates,end:cur};
}
function apSchedule(reg, lists, pairing, start, CONC){
  const meta={}; let cur=new Date(start);
  lists.forEach(ps=>{ const r=apDates(reg,ps,pairing,cur,CONC); ps.forEach(s=>meta[s]=r.dates[s]); cur=r.end; });
  return meta;
}
function apVendor(reg, active){ const w=[]; active.forEach(s=>{ const d=reg[s]; if(d&&d.specialFlags&&d.specialFlags.indexOf("requiresVendor")>=0) w.push('"'+s+'" needs a 3rd-party Vendor PM — submit the ticket at least a month before start.'); }); return w; }
function apDepWarn(reg, phases, active){ const w=[], set=new Set(active), s2p={}; phases.forEach((ph,i)=>ph.forEach(s=>s2p[s]=i+1));
  phases.forEach((ph,i)=>{ const pn=i+1; ph.forEach(s=>{ (reg[s].requires||[]).forEach(d=>{ if(!set.has(d))return; const dp=s2p[d]; if(dp>pn) w.push('Phase '+pn+': "'+s+'" is scheduled before its prerequisite "'+d+'".'); }); }); });
  return w; }
