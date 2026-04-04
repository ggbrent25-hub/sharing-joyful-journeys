import { useState, useRef, useEffect, useCallback } from "react";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  sand:"#F5E6C8", terracotta:"#C4623A", sage:"#7A9E7E",
  sky:"#5B8DB8", plum:"#7B5C8A", gold:"#D4A843",
  cream:"#FDFAF4", dark:"#2C2416", muted:"#8C7B65",
};

const NAV = [
  { id:"bucketlist", label:"Bucket List", icon:"✦", color:C.terracotta },
  { id:"planner",    label:"Planner",     icon:"◈", color:C.sky },
  { id:"memories",   label:"Memories",   icon:"❋", color:C.sage },
  { id:"youtube",    label:"SJJ Studio", icon:"▶", color:C.plum },
  { id:"aisuggest",  label:"AI Suggest", icon:"✧", color:C.gold },
];

const REGIONS = ["All","Palm Springs & Desert","SoCal Coast","Los Angeles","Central Coast","Bay Area","NorCal","Sierra Nevada"];
const VIBES   = ["Hidden Gem","Scenic Drive","Foodie","Beach","Mountain","Culture","Wine","Adventure"];
const SEASONS = { Spring:"🌸", Summer:"☀️", Fall:"🍂", Winter:"❄️" };

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const SEED_BUCKET = [
  { id:"b1", name:"Big Sur Coastal Drive",  region:"Central Coast",          vibes:["Scenic Drive","Beach"],     priority:"Dream Trip", notes:"Highway 1 in spring — wildflowers! Post Ranch Inn?",      bestSeason:"Spring", lat:36.270, lng:-121.807, youtubeAngle:"Iconic cinematic coastal drive perfect for SJJ" },
  { id:"b2", name:"Joshua Tree Sunrise",    region:"Palm Springs & Desert",   vibes:["Adventure","Hidden Gem"],   priority:"Next Up",    notes:"Skull Rock at dawn — surreal and totally deserted.",       bestSeason:"Winter", lat:34.134, lng:-116.313, youtubeAngle:"Desert magic right from home base" },
  { id:"b3", name:"Napa Valley Harvest",    region:"Bay Area",                vibes:["Wine","Foodie"],            priority:"Dream Trip", notes:"September harvest — try The French Laundry if possible!",  bestSeason:"Fall",   lat:38.503, lng:-122.265, youtubeAngle:"Vineyard harvest series — cinematic food & wine" },
  { id:"b4", name:"Carmel & Monterey",      region:"Central Coast",           vibes:["Beach","Culture","Foodie"], priority:"Next Up",    notes:"Fisherman's Wharf chowder + hidden art galleries.",         bestSeason:"Summer", lat:36.600, lng:-121.894, youtubeAngle:"Charming coastal town hidden from most tourists" },
];
const SEED_MEMORIES = [
  { id:"m1", name:"Laguna Beach Day Trip", date:"March 2025", region:"SoCal Coast", rating:5,
    highlight:"Found the most incredible hidden cove — completely deserted at sunrise!",
    youtubeReady:true, photoIds:[], coverPhotoId:null,
    whatWeLoved:["Secret sunrise cove","Fresh seafood tacos","Golden morning light"],
    bestFor:"Romantic escape + golden hour photography" },
];
const SEED_TRIPS   = [{ id:"t1", name:"Desert Discovery Weekend", destination:"Joshua Tree & Palm Springs", dates:"Spring 2026", days:3, status:"Planning", notes:"Our first big trip from the new home base!" }];
const SEED_YOUTUBE = [
  { id:"y1", title:"Top 5 Hidden Beaches Near Palm Springs", status:"Idea",          priority:"High",   notes:"Crystal Cove, El Matador, Zuma — find 2 more. 'Desert to Coast' angle!" },
  { id:"y2", title:"Our Big Sur Road Trip Guide",            status:"In Production", priority:"Medium", notes:"B-roll from trip, Highway 1 voiceover, restaurant picks" },
];

// ─── PHOTO COMPRESSION ────────────────────────────────────────────────────────
// Uses FileReader → Image → Canvas pipeline with explicit iPad Safari support.
// Falls back to raw base64 if canvas fails — guarantees a result either way.
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      // Try canvas compression
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 900;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL("image/jpeg", 0.75);
          // Sanity check — if result is tiny something went wrong, use original
          resolve(compressed.length > 1000 ? compressed : dataUrl);
        } catch {
          resolve(dataUrl); // Canvas failed — use raw
        }
      };
      img.onerror = () => resolve(dataUrl); // Image load failed — use raw
      img.src = dataUrl;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// ─── STORAGE — DUAL LAYER ─────────────────────────────────────────────────────
// Writes to BOTH window.storage (Claude artifact) AND localStorage (browser).
// Reads from window.storage first, falls back to localStorage.
// This means data survives even if one layer fails.

const LS_PREFIX = "sjj_";

async function storageSet(key, value) {
  // Always write to localStorage first — it's synchronous and reliable
  try { localStorage.setItem(LS_PREFIX + key, value); } catch {}
  // Also write to window.storage (async, may not persist across sessions)
  try { await window.storage.set(key, value); } catch {}
}

async function storageGet(key) {
  // Try window.storage first
  try {
    const r = await window.storage.get(key);
    if (r?.value) {
      // Mirror to localStorage in case window.storage is ahead
      try { localStorage.setItem(LS_PREFIX + key, r.value); } catch {}
      return r.value;
    }
  } catch {}
  // Fall back to localStorage
  try {
    const v = localStorage.getItem(LS_PREFIX + key);
    if (v) return v;
  } catch {}
  return null;
}

async function storageDelete(key) {
  try { localStorage.removeItem(LS_PREFIX + key); } catch {}
  try { await window.storage.delete(key); } catch {}
}

// ─── PHOTO STORAGE HELPERS ────────────────────────────────────────────────────
const photoKey = (id) => `sjj-photo-${id}`;

async function savePhoto(id, data) {
  try {
    await storageSet(photoKey(id), JSON.stringify(data));
    return true;
  } catch { return false; }
}

async function loadPhoto(id) {
  try {
    const v = await storageGet(photoKey(id));
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

async function deletePhoto(id) {
  await storageDelete(photoKey(id));
}

async function loadPhotosForMemory(photoIds = []) {
  const results = await Promise.all(photoIds.map(id => loadPhoto(id)));
  return photoIds.map((id, i) => ({ id, ...(results[i] || { url:"", caption:"", originalName:"" }) }));
}

// ─── GENERIC STORAGE HOOK ─────────────────────────────────────────────────────
function useStored(key, seedData) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const v = await storageGet(key);
        if (v) {
          setData(JSON.parse(v));
        } else {
          setData(seedData);
          await storageSet(key, JSON.stringify(seedData));
        }
      } catch {
        setData(seedData);
      }
      setLoading(false);
    })();
  }, [key]);

  const save = useCallback(async (newData) => {
    setData(newData);
    try { await storageSet(key, JSON.stringify(newData)); } catch {}
  }, [key]);

  return [data, save, loading];
}

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const Tag = ({ label, color }) => (
  <span style={{ background:color+"22", color, border:`1px solid ${color}44`, borderRadius:20,
    padding:"2px 10px", fontSize:11, fontWeight:600, fontFamily:"'Playfair Display',serif", whiteSpace:"nowrap" }}>
    {label}
  </span>
);
const Card = ({ children, style={} }) => (
  <div style={{ background:C.cream, borderRadius:16, padding:20, border:`1px solid ${C.sand}`,
    boxShadow:"0 2px 12px rgba(44,36,22,0.07)", marginBottom:14, ...style }}>{children}</div>
);
const Inp = ({ style={}, ...p }) => (
  <input style={{ width:"100%", boxSizing:"border-box", padding:"10px 14px", marginBottom:10,
    border:`1px solid ${C.sand}`, borderRadius:10, fontSize:13, fontFamily:"Georgia,serif",
    color:C.dark, background:"#FEFCF8", outline:"none", ...style }} {...p} />
);
const TA = ({ style={}, ...p }) => (
  <textarea style={{ width:"100%", boxSizing:"border-box", padding:"10px 14px", marginBottom:10,
    border:`1px solid ${C.sand}`, borderRadius:10, fontSize:13, fontFamily:"Georgia,serif",
    color:C.dark, background:"#FEFCF8", outline:"none", resize:"vertical", ...style }} {...p} />
);
const Sel = ({ opts, style={}, ...p }) => (
  <select style={{ width:"100%", boxSizing:"border-box", padding:"10px 14px", marginBottom:10,
    border:`1px solid ${C.sand}`, borderRadius:10, fontSize:13, fontFamily:"Georgia,serif",
    color:C.dark, background:"#FEFCF8", outline:"none", ...style }} {...p}>
    {opts.map(o => <option key={o}>{o}</option>)}
  </select>
);
const Btn = ({ bg=C.terracotta, children, style={}, ...p }) => (
  <button style={{ background:bg, color:"#fff", border:"none", borderRadius:10,
    padding:"10px 20px", fontFamily:"'Playfair Display',serif", fontSize:13,
    cursor:"pointer", boxShadow:`0 3px 10px ${bg}44`, ...style }} {...p}>{children}</button>
);
const Ghost = ({ children, style={}, ...p }) => (
  <button style={{ background:"transparent", color:C.muted, border:`1px solid ${C.sand}`,
    borderRadius:10, padding:"10px 18px", fontFamily:"'Playfair Display',serif",
    fontSize:13, cursor:"pointer", ...style }} {...p}>{children}</button>
);
const Spin = ({ label="Thinking…" }) => (
  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0",
    color:C.muted, fontFamily:"Georgia,serif", fontSize:13 }}>
    <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    <div style={{ width:15, height:15, border:`2px solid ${C.gold}`, borderTopColor:"transparent",
      borderRadius:"50%", animation:"sp 0.8s linear infinite" }}/>
    {label}
  </div>
);
const LoadScreen = () => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
    justifyContent:"center", minHeight:"55vh", gap:14 }}>
    <div style={{ fontSize:30, color:C.gold }}>✦</div>
    <Spin label="Loading your journeys…"/>
  </div>
);

// ─── SAVE BADGE ───────────────────────────────────────────────────────────────
function SaveBadge({ state }) {
  // state: "idle" | "saving" | "saved" | "error"
  const cfg = {
    idle:   { bg:C.muted,       icon:"○", text:"Ready" },
    saving: { bg:C.gold,        icon:"💾", text:"Saving…" },
    saved:  { bg:C.sage,        icon:"✓",  text:"All saved" },
    error:  { bg:C.terracotta,  icon:"!",  text:"Save failed" },
  }[state] || { bg:C.muted, icon:"○", text:"" };
  return (
    <div style={{ position:"fixed", bottom:18, right:14, zIndex:600,
      background:cfg.bg, color:"#fff", borderRadius:20, padding:"5px 13px",
      fontSize:11, fontFamily:"Georgia,serif", boxShadow:"0 2px 10px rgba(0,0,0,0.18)",
      display:"flex", alignItems:"center", gap:6, transition:"background 0.3s",
      letterSpacing:"0.04em" }}>
      {cfg.icon} {cfg.text}
    </div>
  );
}

// ─── CA MAP ───────────────────────────────────────────────────────────────────
function CAMap({ items=[] }) {
  const [hov, setHov] = useState(null);
  const W=320, H=400;
  const proj = (lat,lng) => ({ x:((lng+124.4)/(124.4-114.1))*W, y:H-((lat-32.5)/(42-32.5))*H });
  const ps = proj(33.83,-116.54);
  return (
    <div style={{ background:"#EAF2EC", borderRadius:16, border:`1px solid ${C.sage}44`, overflow:"hidden", maxWidth:340, margin:"0 auto 20px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", display:"block" }}>
        <polygon points="75,8 255,28 305,118 315,198 285,338 235,398 95,408 35,378 15,278 25,148 45,78" fill="#D6E8D2" stroke="#7A9E7E" strokeWidth="2"/>
        {[0.25,0.5,0.75].map(t=>(
          <g key={t}>
            <line x1={0} y1={H*t} x2={W} y2={H*t} stroke="#7A9E7E" strokeWidth="0.5" strokeDasharray="4,6" opacity="0.4"/>
            <line x1={W*t} y1={0} x2={W*t} y2={H} stroke="#7A9E7E" strokeWidth="0.5" strokeDasharray="4,6" opacity="0.4"/>
          </g>
        ))}
        <circle cx={ps.x} cy={ps.y} r={9} fill={C.gold} opacity="0.9"/>
        <text x={ps.x+12} y={ps.y+4} fontSize="9" fill={C.dark} fontFamily="Georgia,serif">🏠 2027</text>
        {items.map(item => {
          if(!item.lat||!item.lng) return null;
          const p=proj(item.lat,item.lng), isH=hov===item.id;
          return (
            <g key={item.id} style={{cursor:"pointer"}} onMouseEnter={()=>setHov(item.id)} onMouseLeave={()=>setHov(null)}>
              <circle cx={p.x} cy={p.y} r={isH?9:6} fill={item.priority==="Dream Trip"?C.plum:C.terracotta}
                stroke="#fff" strokeWidth={isH?2:1.5} style={{transition:"all 0.2s"}}/>
              {isH && (
                <g>
                  <rect x={p.x+11} y={p.y-17} width={120} height={20} rx={4} fill={C.dark} opacity="0.92"/>
                  <text x={p.x+15} y={p.y-3} fontSize="9" fill="#fff" fontFamily="Georgia,serif">{item.name.slice(0,18)}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ padding:"8px 14px", borderTop:`1px solid ${C.sage}33`, display:"flex", gap:12, flexWrap:"wrap" }}>
        {[["Home Base 2027",C.gold],["Dream Trip",C.plum],["Next Up",C.terracotta]].map(([l,c])=>(
          <div key={l} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:C.muted, fontFamily:"Georgia,serif" }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:c, display:"inline-block" }}/>{l}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BUCKET LIST ──────────────────────────────────────────────────────────────
function BucketList({ onSave }) {
  const [items, saveItems, loading] = useStored("sjj-bucket", SEED_BUCKET);
  const [filter, setFilter]   = useState("All");
  const [view, setView]       = useState("list");
  const [showAdd, setShowAdd] = useState(false);
  const [aiMode, setAiMode]   = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const aiDescRef = useRef("");
  const blank = { name:"", region:REGIONS[1], vibes:[], notes:"", priority:"Next Up", bestSeason:"Spring", lat:null, lng:null, youtubeAngle:"" };
  const [form, setForm] = useState(blank);

  const filtered = !items ? [] : filter==="All" ? items : items.filter(i=>i.region===filter);
  const toggleVibe = v => setForm(f=>({ ...f, vibes:f.vibes.includes(v)?f.vibes.filter(x=>x!==v):[...f.vibes,v] }));

  const callAI = async () => {
    const text = aiDescRef.current.trim();
    if(!text) { alert("Please type a description first!"); return; }
    setAiLoading(true);
    try {
      const res = await fetch("/api/suggest",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:800,
          system:`Fill California bucket list entries for a couple moving to Palm Springs CA in 2027. They love hidden gems, coastal, mountains, food & wine, cities. YouTube: "Sharing Joyful Journeys".
Return ONLY valid JSON (no markdown): name, region (one of: Palm Springs & Desert, SoCal Coast, Los Angeles, Central Coast, Bay Area, NorCal, Sierra Nevada), vibes (array from: Hidden Gem, Scenic Drive, Foodie, Beach, Mountain, Culture, Wine, Adventure), notes (insider tip 1-2 sentences), priority (Next Up|Dream Trip|Someday), bestSeason (Spring|Summer|Fall|Winter), lat (number), lng (number), youtubeAngle (one sentence).`,
          messages:[{role:"user", content:`Fill details for: "${text}"`}]
        })
      });
      const data = await res.json();
      const raw = data.content?.find(b=>b.type==="text")?.text||"{}";
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setForm(f=>({...f,...parsed,vibes:parsed.vibes||[]}));
      setAiMode(false);
    } catch { alert("Couldn't generate — try again!"); }
    setAiLoading(false);
  };

  const doSave = async () => {
    if(!form.name.trim()||!items) return;
    onSave("saving");
    await saveItems([...items, {...form, id:`b${Date.now()}`}]);
    setForm(blank); setShowAdd(false); aiDescRef.current=""; onSave("saved");
  };
  const remove = async (id) => { onSave("saving"); await saveItems(items.filter(i=>i.id!==id)); onSave("saved"); };

  if(loading) return <LoadScreen/>;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
        <div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:C.dark,margin:0}}>California Bucket List</h2>
          <p style={{color:C.muted,fontSize:13,margin:"4px 0 0",fontFamily:"Georgia,serif"}}>{(items||[]).length} places calling your names ✦</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Ghost onClick={()=>setView(v=>v==="list"?"map":"list")} style={{padding:"7px 11px",fontSize:11,touchAction:"manipulation"}}>
            {view==="list"?"🗺️ Map":"☰ List"}
          </Ghost>
          <Btn onClick={()=>setShowAdd(!showAdd)} style={{padding:"8px 14px",fontSize:13,touchAction:"manipulation"}}>+ Add</Btn>
        </div>
      </div>

      {/* Region filter pills */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:16}}>
        {REGIONS.map(r=>(
          <button key={r} onClick={()=>setFilter(r)} style={{
            background:filter===r?C.terracotta:"transparent", color:filter===r?"#fff":C.muted,
            border:`1px solid ${filter===r?C.terracotta:C.sand}`, borderRadius:20,
            padding:"4px 12px", fontSize:11, fontFamily:"'Playfair Display',serif",
            cursor:"pointer", touchAction:"manipulation"
          }}>{r}</button>
        ))}
      </div>

      {/* Map — always shows when view=map, regardless of add form state */}
      {view==="map" && <CAMap items={filtered}/>}

      {/* Add form */}
      {showAdd && (
        <Card style={{border:`2px dashed ${C.terracotta}55`,background:"#FEF9F5"}}>
          <div style={{display:"flex",gap:6,marginBottom:14}}>
            {[["✏️ Manual",false],["✧ AI Fill-in",true]].map(([label,val])=>(
              <button key={label} onClick={()=>setAiMode(val)} style={{flex:1,padding:"10px",borderRadius:8,
                border:`2px solid ${aiMode===val?(val?C.gold:C.terracotta):C.sand}`,
                background:aiMode===val?(val?C.gold+"11":C.terracotta+"11"):"transparent",
                color:aiMode===val?(val?C.gold:C.terracotta):C.muted,
                fontFamily:"'Playfair Display',serif",fontSize:13,cursor:"pointer",
                touchAction:"manipulation"}}>{label}</button>
            ))}
          </div>
          {aiMode ? (
            <>
              <textarea
                rows={4}
                defaultValue=""
                placeholder="e.g. 'That lavender farm near Santa Barbara — great for wine photos and a slow romantic weekend'…"
                onInput={e=>{ aiDescRef.current = e.target.value; }}
                onChange={e=>{ aiDescRef.current = e.target.value; }}
                style={{width:"100%",boxSizing:"border-box",padding:"12px 14px",marginBottom:12,
                  border:`2px solid ${C.terracotta}44`,borderRadius:10,fontSize:14,fontFamily:"Georgia,serif",
                  color:C.dark,background:"#FEFCF8",outline:"none",resize:"vertical",
                  WebkitAppearance:"none",touchAction:"manipulation",lineHeight:1.6}}
              />
              {aiLoading ? <Spin label="AI is filling in the details…"/> : (
                <button onClick={callAI}
                  style={{width:"100%",padding:"14px",background:C.gold,color:"#fff",border:"none",
                    borderRadius:10,fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:600,
                    cursor:"pointer",boxShadow:`0 3px 14px ${C.gold}55`,
                    WebkitAppearance:"none",touchAction:"manipulation"}}>
                  ✧ Generate Details
                </button>
              )}
              {form.name && (
                <div style={{marginTop:12,padding:12,background:C.gold+"11",borderRadius:10,border:`1px solid ${C.gold}44`}}>
                  <p style={{fontFamily:"'Playfair Display',serif",fontWeight:700,color:C.dark,margin:"0 0 4px"}}>✦ {form.name}</p>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                    <Tag label={form.region} color={C.sky}/>
                    {(form.vibes||[]).map(v=><Tag key={v} label={v} color={C.gold}/>)}
                    <Tag label={form.priority} color={C.plum}/>
                  </div>
                  <p style={{fontSize:12,color:C.muted,fontFamily:"Georgia,serif",margin:"0 0 5px"}}>{form.notes}</p>
                  {form.youtubeAngle&&<p style={{fontSize:11,color:C.plum,fontFamily:"Georgia,serif",margin:0}}>▶ {form.youtubeAngle}</p>}
                </div>
              )}
            </>
          ) : (
            <>
              <Inp value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Place name…"/>
              <div style={{display:"flex",gap:8}}>
                <Sel opts={REGIONS.slice(1)} value={form.region} onChange={e=>setForm(f=>({...f,region:e.target.value}))} style={{flex:2,margin:"0 0 10px"}}/>
                <Sel opts={["Next Up","Dream Trip","Someday"]} value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} style={{flex:1,margin:"0 0 10px"}}/>
              </div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                {VIBES.map(v=>(
                  <button key={v} onClick={()=>toggleVibe(v)} style={{
                    background:form.vibes.includes(v)?C.gold:"transparent",
                    color:form.vibes.includes(v)?"#fff":C.muted,
                    border:`1px solid ${form.vibes.includes(v)?C.gold:C.sand}`,
                    borderRadius:20,padding:"4px 10px",fontSize:11,fontFamily:"Georgia,serif",cursor:"pointer",touchAction:"manipulation"
                  }}>{v}</button>
                ))}
              </div>
              <TA value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} placeholder="Notes, insider tips…"/>
            </>
          )}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}>
            <Ghost onClick={()=>{setShowAdd(false);aiDescRef.current="";setForm(blank);}}>Cancel</Ghost>
            {form.name && <Btn onClick={doSave}>Save ✦</Btn>}
          </div>
        </Card>
      )}

      {/* List */}
      {view==="list" && (items||[]).map(item=>(
        <Card key={item.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:C.dark,margin:"0 0 6px"}}>{item.name}</h3>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                <Tag label={item.region} color={C.sky}/>
                {(item.vibes||[]).map(v=><Tag key={v} label={v} color={C.gold}/>)}
                <Tag label={item.priority} color={item.priority==="Dream Trip"?C.plum:item.priority==="Next Up"?C.terracotta:C.muted}/>
                {item.bestSeason&&<Tag label={`${SEASONS[item.bestSeason]} ${item.bestSeason}`} color={C.sage}/>}
              </div>
              {item.notes&&<p style={{color:C.muted,fontSize:13,fontFamily:"Georgia,serif",margin:"0 0 4px",lineHeight:1.6}}>💬 {item.notes}</p>}
              {item.youtubeAngle&&<p style={{color:C.plum,fontSize:12,fontFamily:"Georgia,serif",margin:0}}>▶ {item.youtubeAngle}</p>}
            </div>
            <button onClick={()=>remove(item.id)} style={{background:"transparent",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"0 0 0 10px",lineHeight:1}}>×</button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── TRIP PLANNER ─────────────────────────────────────────────────────────────
function TripPlanner({ onSave }) {
  const [trips, saveTrips, loading]       = useStored("sjj-trips", SEED_TRIPS);
  const [ytItems, saveYt]                 = useStored("sjj-youtube", SEED_YOUTUBE);
  const [memories, saveMemories]          = useStored("sjj-memories", SEED_MEMORIES);
  const [showAdd, setShowAdd]             = useState(false);
  const [editingId, setEditingId]         = useState(null);
  const [convertPrompt, setConvertPrompt] = useState(null);
  const statusColor = { Planning:C.sky, Booked:C.sage, Completed:C.gold };
  const blank = { name:"", destination:"", dates:"", days:"", status:"Planning", notes:"" };
  const [form, setForm] = useState(blank);

  const cancelForm = () => { setShowAdd(false); setEditingId(null); setForm(blank); };

  const startEdit = (t) => {
    setForm({...t});
    setEditingId(t.id);
    setShowAdd(true);
    window.scrollTo({top:0, behavior:"smooth"});
  };

  const doSave = async () => {
    if(!form.name.trim()||!trips) return;
    onSave("saving");
    const isNew = !editingId;
    const updatedTrips = isNew
      ? [...trips, {...form, id:`t${Date.now()}`, hasYouTubeIdea:true}]
      : trips.map(t => t.id===editingId ? {...form, id:editingId} : t);
    await saveTrips(updatedTrips);
    // Auto-create YouTube idea for new trips only
    if(isNew && ytItems) {
      await saveYt([...ytItems, {
        id:`y${Date.now()}`, title:`Our ${form.name} Adventure`,
        status:"Idea", priority:"Medium",
        notes:`Planned trip to ${form.destination}${form.dates?" ("+form.dates+")":""}. ${form.notes||""}`.trim()
      }]);
    }
    cancelForm();
    onSave("saved");
  };

  const remove = async (id) => {
    onSave("saving");
    await saveTrips((trips||[]).filter(t=>t.id!==id));
    onSave("saved");
  };

  const pushToYouTube = async (t) => {
    if(!ytItems) return;
    onSave("saving");
    await saveYt([...ytItems, {
      id:`y${Date.now()}`, title:`Our ${t.name} Adventure`,
      status:"Idea", priority:"Medium",
      notes:`Trip to ${t.destination}${t.dates?" ("+t.dates+")":""}. ${t.notes||""}`.trim()
    }]);
    await saveTrips((trips||[]).map(tr => tr.id===t.id ? {...tr, hasYouTubeIdea:true} : tr));
    onSave("saved");
  };

  const convertToMemory = async (t) => {
    if(!memories) return;
    onSave("saving");
    await saveMemories([...memories, {
      id:`m${Date.now()}`, name:t.name, date:t.dates||"",
      region:REGIONS[1], rating:5,
      highlight:`An amazing trip to ${t.destination}!`,
      youtubeReady:false, photoIds:[], coverPhotoId:null,
      whatWeLoved:[], bestFor:""
    }]);
    await saveTrips((trips||[]).map(tr => tr.id===t.id ? {...tr, status:"Completed"} : tr));
    setConvertPrompt(null);
    onSave("saved");
  };

  if(loading) return <LoadScreen/>;

  return (
    <div>
      {/* Convert to Memory modal */}
      {convertPrompt && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:900,
          display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{maxWidth:400,width:"100%",margin:0}}>
            <h3 style={{fontFamily:"'Playfair Display',serif",color:C.sage,margin:"0 0 10px"}}>❋ Turn into a Memory?</h3>
            <p style={{fontFamily:"Georgia,serif",fontSize:13,color:C.muted,margin:"0 0 16px",lineHeight:1.6}}>
              Convert <strong style={{color:C.dark}}>{convertPrompt.name}</strong> into a Memory so you can add photos, highlights, and what you loved — and feed it into your SJJ channel!
            </p>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <Ghost onClick={()=>setConvertPrompt(null)} style={{padding:"8px 14px",fontSize:13}}>Not yet</Ghost>
              <Btn bg={C.sage} onClick={()=>convertToMemory(convertPrompt)}
                style={{padding:"8px 14px",fontSize:13,boxShadow:`0 3px 10px ${C.sage}44`,touchAction:"manipulation"}}>
                ❋ Yes, create Memory
              </Btn>
            </div>
          </Card>
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:C.dark,margin:0}}>Trip Planner</h2>
          <p style={{color:C.muted,fontSize:13,margin:"4px 0 0",fontFamily:"Georgia,serif"}}>Your journey pipeline ◈</p>
        </div>
        <Btn bg={C.sky} onClick={()=>{cancelForm();setShowAdd(true);}}
          style={{padding:"8px 14px",fontSize:13,boxShadow:`0 3px 10px ${C.sky}44`,touchAction:"manipulation"}}>
          + New Trip
        </Btn>
      </div>

      {/* Pipeline banner */}
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:18,padding:"8px 12px",
        background:C.sky+"11",borderRadius:10,border:`1px solid ${C.sky}33`,flexWrap:"wrap"}}>
        {["✦ Bucket List","◈ Planner","❋ Memory","▶ YouTube"].map((s,i,arr)=>(
          <span key={s} style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,fontFamily:"'Playfair Display',serif",color:C.sky,fontWeight:600}}>{s}</span>
            {i<arr.length-1&&<span style={{color:C.sand,fontSize:12}}>→</span>}
          </span>
        ))}
      </div>

      {/* Add / Edit form */}
      {showAdd && (
        <Card style={{border:`2px dashed ${C.sky}55`,background:"#F5F9FD"}}>
          <h4 style={{fontFamily:"'Playfair Display',serif",color:C.sky,marginTop:0}}>
            {editingId ? "✏️ Edit Trip" : "◈ Plan a New Trip"}
          </h4>
          <Inp value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Trip name…"/>
          <Inp value={form.destination} onChange={e=>setForm(f=>({...f,destination:e.target.value}))} placeholder="Destination…"/>
          <div style={{display:"flex",gap:8}}>
            <Inp value={form.dates} onChange={e=>setForm(f=>({...f,dates:e.target.value}))}
              placeholder="Dates (e.g. May 2026)…" style={{flex:2,margin:"0 0 10px"}}/>
            <Inp value={form.days} onChange={e=>setForm(f=>({...f,days:e.target.value}))}
              type="number" placeholder="Days" style={{flex:1,margin:"0 0 10px"}}/>
          </div>
          <Sel opts={["Planning","Booked","Completed"]} value={form.status}
            onChange={e=>setForm(f=>({...f,status:e.target.value}))}/>
          <TA value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
            rows={3} placeholder="Notes, ideas, must-dos…"/>
          {!editingId && (
            <p style={{fontSize:11,color:C.sky,fontFamily:"Georgia,serif",margin:"-4px 0 10px",fontStyle:"italic"}}>
              ✨ Saving will auto-create a YouTube video idea in SJJ Studio
            </p>
          )}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Ghost onClick={cancelForm}>Cancel</Ghost>
            <Btn bg={C.sky} onClick={doSave}
              style={{boxShadow:`0 3px 10px ${C.sky}44`,touchAction:"manipulation"}}>
              {editingId ? "Update Trip ✓" : "Save Trip ◈"}
            </Btn>
          </div>
        </Card>
      )}

      {/* Trip cards */}
      {(trips||[]).map(t=>(
        <Card key={t.id} style={{borderLeft:`4px solid ${statusColor[t.status]||C.sky}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:19,color:C.dark,margin:"0 0 4px"}}>{t.name}</h3>
              <p style={{color:C.muted,fontSize:13,fontFamily:"Georgia,serif",margin:"0 0 8px"}}>📍 {t.destination}</p>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:t.notes?10:0}}>
                <Tag label={t.status} color={statusColor[t.status]||C.sky}/>
                {t.dates&&<Tag label={t.dates} color={C.muted}/>}
                {t.days&&<Tag label={`${t.days} days`} color={C.gold}/>}
              </div>
              {t.notes&&<p style={{color:C.muted,fontSize:13,fontFamily:"Georgia,serif",margin:"8px 0 0",lineHeight:1.6}}>💬 {t.notes}</p>}
            </div>
            <button onClick={()=>remove(t.id)}
              style={{background:"transparent",border:"none",color:C.muted,fontSize:18,
                cursor:"pointer",padding:"0 0 0 10px",lineHeight:1,touchAction:"manipulation"}}>×</button>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
            <button onClick={()=>startEdit(t)}
              style={{flex:1,padding:"8px",background:"transparent",border:`1px solid ${C.sky}66`,
                borderRadius:8,color:C.sky,fontFamily:"'Playfair Display',serif",fontSize:12,
                cursor:"pointer",touchAction:"manipulation"}}>
              ✏️ Edit
            </button>
            {!t.hasYouTubeIdea && (
              <button onClick={()=>pushToYouTube(t)}
                style={{flex:1,padding:"8px",background:C.plum+"11",border:`1px solid ${C.plum}66`,
                  borderRadius:8,color:C.plum,fontFamily:"'Playfair Display',serif",fontSize:12,
                  cursor:"pointer",touchAction:"manipulation"}}>
                ▶ → Studio
              </button>
            )}
            {t.status!=="Completed" ? (
              <button onClick={()=>setConvertPrompt(t)}
                style={{flex:2,padding:"8px",background:C.sage+"11",border:`1px solid ${C.sage}66`,
                  borderRadius:8,color:C.sage,fontFamily:"'Playfair Display',serif",fontSize:12,
                  cursor:"pointer",touchAction:"manipulation"}}>
                ❋ Mark Done → Memory
              </button>
            ) : (
              <span style={{flex:2,padding:"8px",textAlign:"center",fontFamily:"Georgia,serif",
                fontSize:11,color:C.muted,fontStyle:"italic"}}>
                ✓ Completed — check Memories!
              </span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}


// ─── MEMORIES ─────────────────────────────────────────────────────────────────
function Memories({ onSave }) {
  const [memories, saveMemories, loading] = useStored("sjj-memories", SEED_MEMORIES);
  const [showAdd, setShowAdd]     = useState(false);
  const [editingId, setEditingId] = useState(null); // id of memory being edited
  const [aiMode, setAiMode]       = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [gallery, setGallery]     = useState(null);
  const [slideIdx, setSlideIdx]   = useState(0);
  const [galleryPhotos, setGalleryPhotos] = useState([]);
  const [captioning, setCaptioning] = useState(null);

  // useRef for AI textarea — bypasses iPad Safari state-sync issues
  const aiDescRef = useRef("");

  const [formPhotos, setFormPhotos]   = useState([]);
  const [formCoverId, setFormCoverId] = useState(null);
  const [uploadingCount, setUploadingCount] = useState(0);

  const fileRef = useRef();
  const blank = {name:"",date:"",region:REGIONS[1],rating:5,highlight:"",youtubeReady:false,photoIds:[],coverPhotoId:null,whatWeLoved:[],bestFor:""};
  const [form, setForm] = useState(blank);

  // ── Open edit mode for existing memory ─────────────────────────────────────
  const startEdit = (m) => {
    setForm({ ...m });
    setEditingId(m.id);
    setShowAdd(true);
    setAiMode(false);
    setFormPhotos([]);
    setFormCoverId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelForm = () => {
    setShowAdd(false);
    setEditingId(null);
    setForm(blank);
    setFormPhotos([]);
    setFormCoverId(null);
    aiDescRef.current = "";
  };

  // ── Open gallery: load photos from storage ──────────────────────────────────
  const openGallery = async (mem) => {
    setGallery(mem.id);
    setSlideIdx(0);
    setGalleryPhotos([]);
    if(mem.photoIds?.length) {
      const photos = await loadPhotosForMemory(mem.photoIds);
      setGalleryPhotos(photos);
    }
  };

  // ── Upload & compress photos ────────────────────────────────────────────────
  const handlePhotoFiles = async (e) => {
    const files = Array.from(e.target.files);
    if(!files.length) return;
    setUploadingCount(files.length);

    const processed = [];
    for(const file of files) {
      try {
        const url = await compressImage(file);
        if(url) {
          processed.push({
            tempId: `tmp_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
            url, caption:"", originalName:file.name, saved:false
          });
        }
      } catch(err) {
        console.warn("Photo processing failed:", err);
      }
    }

    if(processed.length === 0) {
      alert("Could not process photos — please try again or use a different photo.");
      setUploadingCount(0);
      return;
    }

    setFormPhotos(prev => {
      const next = [...prev, ...processed];
      if(!formCoverId && next.length > 0) setFormCoverId(next[0].tempId);
      return next;
    });
    setUploadingCount(0);
    e.target.value = "";
  };

  // ── Generate AI caption for a form photo ───────────────────────────────────
  const genCaption = async (tempId) => {
    setCaptioning(tempId);
    const ph = formPhotos.find(p=>p.tempId===tempId);
    if(!ph) { setCaptioning(null); return; }
    try {
      const b64 = ph.url.split(",")[1], mt = ph.url.split(";")[0].split(":")[1];
      const res = await fetch("/api/suggest",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:100,
          system:"Write a warm evocative California travel photo caption under 18 words for 'Sharing Joyful Journeys'. No hashtags.",
          messages:[{role:"user",content:[
            {type:"image",source:{type:"base64",media_type:mt,data:b64}},
            {type:"text",text:"Caption this travel photo."}
          ]}]
        })
      });
      const data = await res.json();
      const cap = data.content?.find(b=>b.type==="text")?.text?.trim()||"";
      setFormPhotos(prev=>prev.map(p=>p.tempId===tempId?{...p,caption:cap}:p));
    } catch{}
    setCaptioning(null);
  };

  // ── AI fill memory — reads from ref, bypasses iPad state sync ─────────────
  const callAI = async () => {
    const text = aiDescRef.current.trim();
    if(!text) {
      alert("Please type a description of your trip first!");
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch("/api/suggest",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:700,
          system:`Fill travel memory details for a couple's journal + YouTube channel "Sharing Joyful Journeys". They love hidden gems, coastal, food & wine, mountains, culture. Palm Springs home base 2027.
Return ONLY valid JSON (no markdown): name, date (approx), region (one of: Palm Springs & Desert, SoCal Coast, Los Angeles, Central Coast, Bay Area, NorCal, Sierra Nevada), rating (1-5), highlight (one vivid sentence), whatWeLoved (array of 3 short strings), bestFor (short phrase), youtubeReady (boolean).`,
          messages:[{role:"user",content:`Memory from: "${text}"`}]
        })
      });
      const data = await res.json();
      const raw = data.content?.find(b=>b.type==="text")?.text||"{}";
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setForm(f=>({...f,...parsed}));
      setAiMode(false);
    } catch(e) { alert(`Couldn't generate — please try again!`); }
    setAiLoading(false);
  };

  // ── Save: handles both new memory and editing existing ─────────────────────
  const doSave = async () => {
    if(!form.name.trim()||!memories) return;
    onSave("saving");

    let savedIds = form.photoIds || [];
    let coverPhotoId = form.coverPhotoId;

    // Only process new photos if any were added in this session
    if(formPhotos.length > 0) {
      const newIds = [];
      for(const ph of formPhotos) {
        const photoId = `photo_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        const ok = await savePhoto(photoId, { url:ph.url, caption:ph.caption, originalName:ph.originalName });
        if(ok) newIds.push(photoId);
      }
      savedIds = [...savedIds, ...newIds];
      const coverIdx = formPhotos.findIndex(p=>p.tempId===formCoverId);
      if(coverIdx>=0 && newIds[coverIdx]) coverPhotoId = newIds[coverIdx];
      else if(!coverPhotoId && newIds.length>0) coverPhotoId = newIds[0];
    }

    const updatedMem = { ...form, photoIds:savedIds, coverPhotoId };

    let updated;
    if(editingId) {
      // Edit mode — replace existing entry
      updated = memories.map(m => m.id===editingId ? { ...updatedMem, id:editingId } : m);
    } else {
      // New memory
      updated = [...memories, { ...updatedMem, id:`m${Date.now()}` }];
    }

    await saveMemories(updated);
    cancelForm();
    onSave("saved");
  };

  const remove = async (mem) => {
    onSave("saving");
    // Clean up photo keys too
    for(const pid of (mem.photoIds||[])) await deletePhoto(pid);
    await saveMemories(memories.filter(m=>m.id!==mem.id));
    onSave("saved");
  };

  if(loading) return <LoadScreen/>;

  const galleryMem = memories?.find(m=>m.id===gallery);

  return (
    <div>
      {/* ── Slideshow gallery modal ── */}
      {gallery && galleryMem && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",zIndex:1000,
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setGallery(null)}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:C.dark,borderRadius:20,padding:20,maxWidth:480,width:"100%",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <h3 style={{fontFamily:"'Playfair Display',serif",color:C.sand,margin:0,fontSize:17}}>{galleryMem.name}</h3>
              <button onClick={()=>setGallery(null)} style={{background:"transparent",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>✕</button>
            </div>
            {galleryPhotos.length===0 ? (
              <div style={{textAlign:"center",padding:"30px 0"}}>
                <Spin label="Loading photos…"/>
              </div>
            ) : (
              <>
                {/* Main photo */}
                <div style={{position:"relative",borderRadius:12,overflow:"hidden",marginBottom:12}}>
                  <img src={galleryPhotos[slideIdx]?.url} alt=""
                    style={{width:"100%",maxHeight:300,objectFit:"cover",display:"block"}}/>
                  {galleryMem.coverPhotoId===galleryPhotos[slideIdx]?.id && (
                    <div style={{position:"absolute",top:8,left:8,background:C.gold,color:"#fff",
                      fontSize:9,borderRadius:8,padding:"2px 8px",fontFamily:"'Playfair Display',serif"}}>COVER</div>
                  )}
                  {galleryPhotos[slideIdx]?.caption && (
                    <div style={{position:"absolute",bottom:0,left:0,right:0,
                      background:"linear-gradient(transparent,rgba(0,0,0,0.72))",padding:"24px 14px 12px"}}>
                      <p style={{color:"#fff",fontSize:12,fontFamily:"Georgia,serif",fontStyle:"italic",margin:0,lineHeight:1.5}}>
                        {galleryPhotos[slideIdx].caption}
                      </p>
                    </div>
                  )}
                  {galleryPhotos.length>1 && (
                    <>
                      <button onClick={()=>setSlideIdx(i=>(i-1+galleryPhotos.length)%galleryPhotos.length)}
                        style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",
                          background:"rgba(0,0,0,0.5)",border:"none",color:"#fff",
                          fontSize:20,width:34,height:34,borderRadius:"50%",cursor:"pointer",lineHeight:1}}>‹</button>
                      <button onClick={()=>setSlideIdx(i=>(i+1)%galleryPhotos.length)}
                        style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",
                          background:"rgba(0,0,0,0.5)",border:"none",color:"#fff",
                          fontSize:20,width:34,height:34,borderRadius:"50%",cursor:"pointer",lineHeight:1}}>›</button>
                    </>
                  )}
                </div>
                {/* Thumbnails */}
                <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
                  {galleryPhotos.map((ph,i)=>(
                    <img key={ph.id} src={ph.url} alt="" onClick={()=>setSlideIdx(i)}
                      style={{width:52,height:52,objectFit:"cover",borderRadius:8,cursor:"pointer",flexShrink:0,
                        border:`2px solid ${i===slideIdx?C.gold:"transparent"}`,opacity:i===slideIdx?1:0.65}}/>
                  ))}
                </div>
                <p style={{color:C.muted,fontSize:10,fontFamily:"Georgia,serif",textAlign:"center",margin:"8px 0 0"}}>
                  {slideIdx+1} / {galleryPhotos.length}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:C.dark,margin:0}}>Our Memories</h2>
          <p style={{color:C.muted,fontSize:13,margin:"4px 0 0",fontFamily:"Georgia,serif"}}>Every joyful journey, captured forever ❋</p>
        </div>
        <Btn bg={C.sage} onClick={()=>setShowAdd(!showAdd)} style={{padding:"8px 14px",fontSize:13,boxShadow:`0 3px 10px ${C.sage}44`}}>+ Memory</Btn>
      </div>

      {/* Add / Edit form */}
      {showAdd && (
        <Card style={{border:`2px dashed ${C.sage}55`,background:"#F5FAF6"}}>
          <h4 style={{fontFamily:"'Playfair Display',serif",color:C.sage,marginTop:0,marginBottom:14}}>
            {editingId ? "✏️ Edit Memory" : "❋ Add New Memory"}
          </h4>
          {/* AI / Manual toggle — only show for new entries */}
          {!editingId && (
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {[["✏️ Manual",false],["✧ AI Fill-in",true]].map(([label,val])=>(
                <button key={label} onClick={()=>setAiMode(val)} style={{flex:1,padding:"10px",borderRadius:8,
                  border:`2px solid ${aiMode===val?(val?C.gold:C.sage):C.sand}`,
                  background:aiMode===val?(val?C.gold+"11":C.sage+"11"):"transparent",
                  color:aiMode===val?(val?C.gold:C.sage):C.muted,
                  fontFamily:"'Playfair Display',serif",fontSize:13,cursor:"pointer",
                  touchAction:"manipulation"}}>{label}</button>
              ))}
            </div>
          )}

          {aiMode && !editingId ? (
            <>
              <textarea
                rows={4}
                defaultValue=""
                placeholder="e.g. 'We spent a weekend in Carmel last October — walked the beach, had incredible oysters, found a tiny hidden gallery. Fall colors were stunning'…"
                onInput={e=>{ aiDescRef.current = e.target.value; }}
                onChange={e=>{ aiDescRef.current = e.target.value; }}
                style={{width:"100%",boxSizing:"border-box",padding:"12px 14px",marginBottom:12,
                  border:`2px solid ${C.sage}55`,borderRadius:10,fontSize:14,fontFamily:"Georgia,serif",
                  color:C.dark,background:"#FEFCF8",outline:"none",resize:"vertical",
                  WebkitAppearance:"none",touchAction:"manipulation",lineHeight:1.6}}
              />
              {aiLoading ? <Spin label="Building your memory…"/> : (
                <button
                  onClick={callAI}
                  style={{width:"100%",padding:"14px",background:C.gold,color:"#fff",border:"none",
                    borderRadius:10,fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:600,
                    cursor:"pointer",boxShadow:`0 3px 14px ${C.gold}55`,
                    WebkitAppearance:"none",touchAction:"manipulation",letterSpacing:"0.02em"}}>
                  ✧ Generate Memory Details
                </button>
              )}
              {form.name && (
                <div style={{marginTop:12,padding:12,background:C.gold+"11",borderRadius:10,border:`1px solid ${C.gold}44`}}>
                  <p style={{fontFamily:"'Playfair Display',serif",fontWeight:700,color:C.dark,margin:"0 0 4px"}}>❋ {form.name}</p>
                  <p style={{fontSize:12,color:C.muted,fontFamily:"Georgia,serif",fontStyle:"italic",margin:"0 0 6px"}}>{form.highlight}</p>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{(form.whatWeLoved||[]).map(w=><Tag key={w} label={w} color={C.sage}/>)}</div>
                </div>
              )}
            </>
          ) : ( /* Manual / Edit fields */
            <>
              <Inp value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Trip name…"/>
              <div style={{display:"flex",gap:8}}>
                <Inp value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} placeholder="Date…" style={{flex:1,margin:"0 0 10px"}}/>
                <Sel opts={REGIONS.slice(1)} value={form.region} onChange={e=>setForm(f=>({...f,region:e.target.value}))} style={{flex:1,margin:"0 0 10px"}}/>
              </div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:12,color:C.muted,fontFamily:"Georgia,serif"}}>Rating: {"⭐".repeat(form.rating)}</label>
                <input type="range" min={1} max={5} value={form.rating}
                  onChange={e=>setForm(f=>({...f,rating:+e.target.value}))}
                  style={{display:"block",width:"100%",marginTop:4}}/>
              </div>
              <TA value={form.highlight} onChange={e=>setForm(f=>({...f,highlight:e.target.value}))} rows={2} placeholder="The highlight moment…"/>
              <Inp value={form.bestFor} onChange={e=>setForm(f=>({...f,bestFor:e.target.value}))} placeholder="Best for… (e.g. romantic weekends)"/>
            </>
          )}

          {/* ── Photo Upload Section ── */}
          <div style={{marginTop:12,marginBottom:12,padding:12,background:"#F0FAF2",borderRadius:12,border:`1px solid ${C.sage}33`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:12,color:C.sage,fontFamily:"'Playfair Display',serif",fontWeight:600}}>📸 Photos</span>
              <span style={{fontSize:10,color:C.muted,fontFamily:"Georgia,serif"}}>Auto-compressed for storage</span>
            </div>
            <input type="file" accept="image/*" multiple ref={fileRef} onChange={handlePhotoFiles} style={{display:"none"}}/>

            {uploadingCount>0 && (
              <div style={{padding:"14px",textAlign:"center"}}>
                <Spin label={`Processing ${uploadingCount} photo${uploadingCount>1?"s":""}… please wait`}/>
              </div>
            )}

            {formPhotos.length===0 && uploadingCount===0 && (
              <button
                onClick={()=>fileRef.current.click()}
                style={{width:"100%",padding:"18px",border:`2px dashed ${C.sage}`,borderRadius:12,
                  background:"rgba(122,158,126,0.08)",color:C.sage,fontFamily:"'Playfair Display',serif",
                  fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",
                  justifyContent:"center",gap:10,touchAction:"manipulation",WebkitAppearance:"none"}}>
                📷 Tap to choose photos
              </button>
            )}

            {formPhotos.length>0 && (
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:10}}>
                  {formPhotos.map((ph)=>(
                    <div key={ph.tempId} style={{position:"relative",borderRadius:8,overflow:"hidden",
                      border:`2px solid ${formCoverId===ph.tempId?C.gold:C.sage+"55"}`}}>
                      <img src={ph.url} alt="" style={{width:"100%",aspectRatio:"1",objectFit:"cover",display:"block"}}/>
                      {/* Cover + Caption buttons overlay */}
                      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.38)",
                        display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:4,gap:3}}>
                        <button onClick={()=>setFormCoverId(ph.tempId)}
                          style={{fontSize:9,padding:"2px 4px",borderRadius:4,border:"none",
                            background:formCoverId===ph.tempId?C.gold:"rgba(255,255,255,0.88)",
                            color:formCoverId===ph.tempId?"#fff":C.dark,cursor:"pointer",fontFamily:"Georgia,serif"}}>
                          {formCoverId===ph.tempId?"✓ Cover":"Set Cover"}
                        </button>
                        {captioning===ph.tempId ? (
                          <div style={{fontSize:9,color:"#fff",fontFamily:"Georgia,serif",textAlign:"center"}}>✧…</div>
                        ) : (
                          <button onClick={()=>genCaption(ph.tempId)}
                            style={{fontSize:9,padding:"2px 4px",borderRadius:4,border:"none",
                              background:"rgba(255,255,255,0.88)",color:C.dark,cursor:"pointer",fontFamily:"Georgia,serif"}}>
                            ✧ AI Caption
                          </button>
                        )}
                      </div>
                      {/* Remove button */}
                      <button onClick={()=>setFormPhotos(prev=>{
                        const next=prev.filter(p=>p.tempId!==ph.tempId);
                        if(formCoverId===ph.tempId) setFormCoverId(next[0]?.tempId||null);
                        return next;
                      })} style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,0.55)",
                        border:"none",color:"#fff",fontSize:12,width:18,height:18,borderRadius:"50%",
                        cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                      {/* Caption preview */}
                      {ph.caption && (
                        <p style={{fontSize:9,color:"#fff",fontFamily:"Georgia,serif",fontStyle:"italic",
                          margin:0,lineHeight:1.3,position:"absolute",bottom:40,left:4,right:4,
                          textShadow:"0 1px 3px rgba(0,0,0,0.9)"}}>
                          {ph.caption.slice(0,40)}…
                        </p>
                      )}
                    </div>
                  ))}
                  {/* Add more button */}
                  <button onClick={()=>fileRef.current.click()}
                    style={{aspectRatio:"1",borderRadius:8,border:`2px dashed ${C.sage}66`,
                      background:"transparent",color:C.sage,fontSize:22,cursor:"pointer",
                      display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                </div>
                <p style={{fontSize:11,color:C.muted,fontFamily:"Georgia,serif",margin:0,textAlign:"center"}}>
                  {formPhotos.length} photo{formPhotos.length!==1?"s":""} ready · Photos save when you tap Save Memory
                </p>
              </>
            )}
          </div>

          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Ghost onClick={cancelForm}>Cancel</Ghost>
            {form.name && (
              <Btn bg={C.sage} onClick={doSave} style={{boxShadow:`0 3px 10px ${C.sage}44`}}>
                {editingId ? "Update Memory ✓" : "Save Memory ❋"}
              </Btn>
            )}
          </div>
        </Card>
      )}

      {/* Memory cards */}
      {(memories||[]).map(m=>(
        <Card key={m.id} style={{overflow:"hidden",padding:0}}>
          {/* Cover photo — load lazily */}
          {m.coverPhotoId && <MemoryCover photoId={m.coverPhotoId} count={m.photoIds?.length||0} onOpen={()=>openGallery(m)}/>}
          <div style={{padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:19,color:C.dark,margin:"0 0 4px"}}>{m.name}</h3>
                <p style={{color:C.muted,fontSize:12,fontFamily:"Georgia,serif",margin:"0 0 8px"}}>📅 {m.date} · 📍 {m.region}</p>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                  <Tag label={"⭐".repeat(m.rating)} color={C.gold}/>
                  {m.youtubeReady&&<Tag label="📹 YouTube Ready" color={C.plum}/>}
                  {m.bestFor&&<Tag label={m.bestFor} color={C.sky}/>}
                </div>
                {m.highlight&&<p style={{color:C.dark,fontSize:14,fontFamily:"Georgia,serif",margin:"0 0 8px",lineHeight:1.7,fontStyle:"italic"}}>❝ {m.highlight}</p>}
                {m.whatWeLoved?.length>0&&(
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:m.photoIds?.length?10:0}}>
                    {m.whatWeLoved.map(w=><Tag key={w} label={`♡ ${w}`} color={C.sage}/>)}
                  </div>
                )}
                {(!m.photoIds||m.photoIds.length===0)&&(
                  <button onClick={()=>openGallery(m)}
                    style={{marginTop:8,background:"transparent",border:`1px solid ${C.sand}`,
                      borderRadius:8,color:C.muted,fontSize:11,padding:"4px 10px",cursor:"pointer",fontFamily:"Georgia,serif"}}>
                    📸 View Gallery
                  </button>
                )}
              </div>
              <button onClick={()=>remove(m)} style={{background:"transparent",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"0 0 0 10px",lineHeight:1}}>×</button>
            </div>
            {/* Edit button */}
            <button onClick={()=>startEdit(m)}
              style={{marginTop:10,width:"100%",padding:"8px",background:"transparent",
                border:`1px solid ${C.sage}66`,borderRadius:8,color:C.sage,
                fontFamily:"'Playfair Display',serif",fontSize:12,cursor:"pointer",
                touchAction:"manipulation"}}>
              ✏️ Edit this memory
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// Lazy-loads a single cover photo from storage
function MemoryCover({ photoId, count, onOpen }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    loadPhoto(photoId).then(ph => setUrl(ph?.url||null));
  }, [photoId]);
  if(!url) return (
    <div style={{height:120,background:C.mint,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}} onClick={onOpen}>
      <Spin label="Loading cover…"/>
    </div>
  );
  return (
    <div style={{height:150,overflow:"hidden",position:"relative",cursor:"pointer"}} onClick={onOpen}>
      <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,transparent 40%,rgba(44,36,22,0.65))"}}/>
      <div style={{position:"absolute",bottom:10,right:12,background:"rgba(255,255,255,0.18)",
        backdropFilter:"blur(4px)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:8,
        color:"#fff",fontSize:11,padding:"4px 10px",fontFamily:"Georgia,serif"}}>
        🖼️ {count} photo{count!==1?"s":""}
      </div>
    </div>
  );
}

// ─── YOUTUBE STUDIO ───────────────────────────────────────────────────────────
function YouTubeStudio({ onSave }) {
  const [items, saveItems, loading] = useStored("sjj-youtube", SEED_YOUTUBE);
  const [showAdd, setShowAdd] = useState(false);
  const blank = {title:"",status:"Idea",priority:"Medium",notes:""};
  const [form, setForm] = useState(blank);
  const statusColor = {Idea:C.gold,"In Production":C.terracotta,Published:C.sage};
  const priorityColor = {High:C.terracotta,Medium:C.sky,Low:C.muted};
  const counts = {Idea:0,"In Production":0,Published:0};
  (items||[]).forEach(i=>{counts[i.status]=(counts[i.status]||0)+1;});

  const doSave = async () => {
    if(!form.title.trim()||!items) return;
    onSave("saving"); await saveItems([...items,{...form,id:`y${Date.now()}`}]);
    setForm(blank); setShowAdd(false); onSave("saved");
  };
  const remove = async (id) => { onSave("saving"); await saveItems(items.filter(i=>i.id!==id)); onSave("saved"); };

  if(loading) return <LoadScreen/>;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:C.dark,margin:0}}>SJJ Content Studio</h2>
          <p style={{color:C.muted,fontSize:13,margin:"4px 0 0",fontFamily:"Georgia,serif"}}>Your Sharing Joyful Journeys pipeline ▶</p>
        </div>
        <Btn bg={C.plum} onClick={()=>setShowAdd(!showAdd)} style={{padding:"8px 14px",fontSize:13,boxShadow:`0 3px 10px ${C.plum}44`}}>+ Video</Btn>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:18}}>
        {Object.entries(counts).map(([k,v])=>(
          <div key={k} style={{background:statusColor[k]+"11",border:`1px solid ${statusColor[k]}33`,
            borderRadius:12,padding:"12px 10px",textAlign:"center"}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:statusColor[k]}}>{v}</div>
            <div style={{fontSize:9,color:C.muted,fontFamily:"Georgia,serif",letterSpacing:"0.05em"}}>{k.toUpperCase()}</div>
          </div>
        ))}
      </div>
      {showAdd && (
        <Card style={{border:`2px dashed ${C.plum}55`,background:"#F9F5FD"}}>
          <Inp value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Video title or concept…"/>
          <div style={{display:"flex",gap:8}}>
            <Sel opts={["Idea","In Production","Published"]} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={{flex:1,margin:"0 0 10px"}}/>
            <Sel opts={["High","Medium","Low"]} value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} style={{flex:1,margin:"0 0 10px"}}/>
          </div>
          <TA value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Story angle, shot ideas, content notes…"/>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Ghost onClick={()=>{setShowAdd(false);setForm(blank);}}>Cancel</Ghost>
            <Btn bg={C.plum} onClick={doSave}>Save Idea ▶</Btn>
          </div>
        </Card>
      )}
      {(items||[]).map(item=>(
        <Card key={item.id}>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <div style={{flex:1}}>
              <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:C.dark,margin:"0 0 8px"}}>{item.title}</h3>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                <Tag label={item.status} color={statusColor[item.status]||C.gold}/>
                <Tag label={`${item.priority} Priority`} color={priorityColor[item.priority]||C.muted}/>
              </div>
              {item.notes&&<p style={{color:C.muted,fontSize:13,fontFamily:"Georgia,serif",margin:0,lineHeight:1.6}}>🎬 {item.notes}</p>}
            </div>
            <button onClick={()=>remove(item.id)} style={{background:"transparent",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"0 0 0 10px",lineHeight:1}}>×</button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── AI SUGGESTIONS ───────────────────────────────────────────────────────────
function AISuggestions({ memoriesData }) {
  const [loading, setLoading]     = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError]         = useState(null);
  const [season, setSeason]       = useState("Fall");
  const [vibe, setVibe]           = useState("Mountain");

  const go = async () => {
    setLoading(true);
    setSuggestions(null);
    setError(null);

    const ctx = (memoriesData||[]).map(m=>
      `${m.name} (${m.region}, ${m.rating}/5): loved — ${(m.whatWeLoved||[]).join(", ")||m.highlight}`
    ).join("\n");

    // Step 1: check if fetch works at all in this environment
    let fetchWorks = false;
    try {
      const ping = await fetch("/api/suggest", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:10, messages:[{role:"user",content:"hi"}] })
      });
      fetchWorks = true; // got a response (even an error response counts)
      const pingData = await ping.json();

      // Step 2: if ping worked, do the real call
      const res = await fetch("/api/suggest", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1200,
          system:`You are a California travel expert for a couple moving to Palm Springs in 2027. They love hidden gems, coastal spots, mountains, food & wine, culture. Their YouTube channel is "Sharing Joyful Journeys". Always prioritize under-the-radar places over tourist traps, seasonal timing, and YouTube content potential.
Respond with ONLY a JSON array — no markdown, no explanation, no backticks. The array must contain exactly 3 objects. Each object must have these exact keys: name (string), region (string), why (string, 1-2 sentences), bestTime (string), hiddenGem (boolean), youtubeAngle (string), driveFromPalmSprings (string like "2.5 hours").`,
          messages:[{ role:"user", content:`Trips they've loved:\n${ctx||"No past trips yet — use their preferences."}\n\nSuggest 3 California destinations ideal for ${season} with a "${vibe}" vibe. Focus on places most tourists miss.` }]
        })
      });

      if(!res.ok) {
        const errText = await res.text();
        throw new Error(`API ${res.status}: ${errText.slice(0,300)}`);
      }

      const data = await res.json();
      if(data.error) throw new Error(data.error.message || JSON.stringify(data.error));

      const textBlock = data.content?.find(b=>b.type==="text");
      if(!textBlock) throw new Error("No text block in response: " + JSON.stringify(data));

      const raw = textBlock.text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(raw);
      if(!Array.isArray(parsed)) throw new Error("Not an array: " + raw.slice(0,100));
      setSuggestions(parsed);

    } catch(e) {
      if(!fetchWorks) {
        setError("⚠️ Network blocked: This app cannot reach the AI API from inside the Claude artifact sandbox. This feature will work once the app is deployed to Vercel. All other features (adding memories, bucket list, photos) work fine!");
      } else {
        setError("Error: " + (e.message || "Unknown — please try again."));
      }
    }

    setLoading(false);
  };

  return (
    <div>
      <div style={{marginBottom:18}}>
        <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:C.dark,margin:0}}>AI Trip Suggestions</h2>
        <p style={{color:C.muted,fontSize:13,margin:"4px 0 0",fontFamily:"Georgia,serif"}}>Personalized picks based on what you've loved ✧</p>
      </div>

      <Card style={{background:"linear-gradient(135deg,#FEF9F0,#F5F0E8)",border:`1px solid ${C.gold}44`}}>
        <h4 style={{fontFamily:"'Playfair Display',serif",color:C.gold,marginTop:0,marginBottom:14}}>✧ What are you looking for?</h4>

        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,fontFamily:"Georgia,serif",marginBottom:6}}>Season</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {Object.entries(SEASONS).map(([s,e])=>(
              <button key={s} onClick={()=>setSeason(s)} style={{padding:"8px 14px",borderRadius:20,
                border:`1px solid ${season===s?C.gold:C.sand}`,
                background:season===s?C.gold:"transparent",
                color:season===s?"#fff":C.muted,fontFamily:"Georgia,serif",fontSize:13,
                cursor:"pointer",touchAction:"manipulation"}}>
                {e} {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{marginBottom:18}}>
          <div style={{fontSize:11,color:C.muted,fontFamily:"Georgia,serif",marginBottom:6}}>Vibe</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {VIBES.map(v=>(
              <button key={v} onClick={()=>setVibe(v)} style={{padding:"7px 13px",borderRadius:20,
                border:`1px solid ${vibe===v?C.terracotta:C.sand}`,
                background:vibe===v?C.terracotta:"transparent",
                color:vibe===v?"#fff":C.muted,fontFamily:"Georgia,serif",fontSize:12,
                cursor:"pointer",touchAction:"manipulation"}}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Selected choices confirmation */}
        <div style={{marginBottom:14,padding:"8px 12px",background:"rgba(212,168,67,0.1)",borderRadius:8,
          fontFamily:"Georgia,serif",fontSize:12,color:C.muted}}>
          Looking for: <strong style={{color:C.dark}}>{season}</strong> · <strong style={{color:C.dark}}>{vibe}</strong>
        </div>

        {loading ? (
          <div style={{padding:"20px 0",textAlign:"center"}}>
            <Spin label="Finding your perfect hidden gems — this takes a moment…"/>
          </div>
        ) : (
          <button onClick={go}
            style={{width:"100%",padding:"16px",background:C.terracotta,color:"#fff",border:"none",
              borderRadius:12,fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:600,
              cursor:"pointer",boxShadow:`0 4px 16px ${C.terracotta}55`,letterSpacing:"0.02em",
              WebkitAppearance:"none",touchAction:"manipulation"}}>
            ✧ Find Hidden Gems for {season}
          </button>
        )}

        {/* Inline error display — no alert() */}
        {error && (
          <div style={{marginTop:12,padding:12,background:"#FEF0EE",borderRadius:10,
            border:`1px solid ${C.terracotta}44`}}>
            <p style={{fontFamily:"'Playfair Display',serif",color:C.terracotta,margin:"0 0 4px",fontSize:13,fontWeight:600}}>
              ⚠️ Couldn't generate suggestions
            </p>
            <p style={{fontFamily:"Georgia,serif",color:C.muted,fontSize:11,margin:"0 0 8px",lineHeight:1.5,wordBreak:"break-word"}}>
              {error}
            </p>
            <button onClick={go} style={{background:C.terracotta,color:"#fff",border:"none",borderRadius:8,
              padding:"6px 14px",fontFamily:"Georgia,serif",fontSize:12,cursor:"pointer",touchAction:"manipulation"}}>
              Try Again
            </button>
          </div>
        )}
      </Card>

      {suggestions && suggestions.map((s,i)=>(
        <Card key={i} style={{borderLeft:`4px solid ${[C.terracotta,C.sage,C.sky][i%3]}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
            <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:19,color:C.dark,margin:0,flex:1,paddingRight:8}}>{s.name}</h3>
            {s.hiddenGem&&<Tag label="💎 Hidden Gem" color={C.plum}/>}
          </div>
          <p style={{color:C.muted,fontSize:12,fontFamily:"Georgia,serif",margin:"0 0 8px"}}>
            📍 {s.region} · 🚗 {s.driveFromPalmSprings} from Palm Springs
          </p>
          <p style={{color:C.dark,fontSize:14,fontFamily:"Georgia,serif",margin:"0 0 10px",lineHeight:1.7}}>{s.why}</p>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {s.bestTime&&<Tag label={`🌸 Best: ${s.bestTime}`} color={C.sage}/>}
            {s.youtubeAngle&&<Tag label={`▶ ${s.youtubeAngle}`} color={C.plum}/>}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [active, setActive] = useState("bucketlist");
  const [saveState, setSaveState] = useState("idle");
  const [memoriesData] = useStored("sjj-memories", SEED_MEMORIES);

  const onSave = useCallback((state) => {
    setSaveState(state);
    if(state==="saved") setTimeout(()=>setSaveState("idle"), 2500);
  }, []);

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#F7F0E3 0%,#EDE0C8 50%,#F0E8D5 100%)",fontFamily:"Georgia,serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{background:C.dark,padding:"15px 18px",display:"flex",alignItems:"center",
        justifyContent:"space-between",boxShadow:"0 4px 20px rgba(44,36,22,0.25)"}}>
        <div>
          <div style={{display:"flex",alignItems:"baseline",gap:8}}>
            <span style={{fontSize:19,color:C.gold}}>✦</span>
            <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:19,color:C.sand,margin:0,letterSpacing:"0.02em"}}>Sharing Joyful Journeys</h1>
          </div>
          <p style={{color:C.muted,fontSize:10,margin:"2px 0 0",letterSpacing:"0.15em",textTransform:"uppercase"}}>Paul & Our California Adventures</p>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:9,color:C.muted,letterSpacing:"0.1em"}}>HOME BASE</div>
          <div style={{fontSize:12,color:C.gold,fontFamily:"'Playfair Display',serif"}}>Palm Springs · 2027 🌴</div>
        </div>
      </div>

      {/* Nav */}
      <div style={{background:"#fff",display:"flex",borderBottom:`2px solid ${C.sand}`,overflowX:"auto"}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setActive(n.id)} style={{
            flex:1,minWidth:64,padding:"11px 4px",background:"transparent",border:"none",
            borderBottom:`3px solid ${active===n.id?n.color:"transparent"}`,
            color:active===n.id?n.color:C.muted,
            fontFamily:"'Playfair Display',serif",fontSize:10,cursor:"pointer",transition:"all 0.2s",
            display:"flex",flexDirection:"column",alignItems:"center",gap:2
          }}>
            <span style={{fontSize:15}}>{n.icon}</span>{n.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{maxWidth:680,margin:"0 auto",padding:"20px 13px 80px"}}>
        {active==="bucketlist" && <BucketList onSave={onSave}/>}
        {active==="planner"    && <TripPlanner onSave={onSave}/>}
        {active==="memories"   && <Memories onSave={onSave}/>}
        {active==="youtube"    && <YouTubeStudio onSave={onSave}/>}
        {active==="aisuggest"  && <AISuggestions memoriesData={memoriesData||[]}/>}
      </div>

      <SaveBadge state={saveState}/>

      <div style={{textAlign:"center",padding:14,color:C.muted,fontSize:10,letterSpacing:"0.1em"}}>
        ✦ SHARING JOYFUL JOURNEYS · CALIFORNIA ✦
      </div>
    </div>
  );
}
