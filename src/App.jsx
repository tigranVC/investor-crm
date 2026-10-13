import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
const sb = createClient('https://uqfvqzmhlipxviumuhlb.supabase.co', 'sb_publishable_ek9FzdFei3m3fMTiRctDXg_zNmizBud')
const STATUSES = ['not contacted','to contact','contacted','replied','meeting','committed','passed']
const TYPES = ['employee/alumni','family office','fund','syndicate','syndicate/channel','angel','platform']
const PRIOS = ['high','medium','low']
const SC = {'not contacted':'bg-gray-100 text-gray-700','to contact':'bg-blue-100 text-blue-700','contacted':'bg-indigo-100 text-indigo-700','replied':'bg-amber-100 text-amber-800','meeting':'bg-purple-100 text-purple-700','committed':'bg-green-100 text-green-700','passed':'bg-red-100 text-red-700'}
const PC = {high:'text-red-600',medium:'text-amber-600',low:'text-gray-400'}
const fmt = n => '$' + Number(n||0).toLocaleString()
const Pill = ({s}) => <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${SC[s]}`}>{s}</span>
const link = v => v && /^https?:/.test(v) ? <a className="text-blue-600 underline break-all" href={v} target="_blank">{v}</a> : (v||'—')

function Login(){
  const [e,setE]=useState('tigran@investor-crm.app'),[p,setP]=useState(''),[err,setErr]=useState('')
  return <div className="h-screen flex items-center justify-center bg-gray-50"><form className="bg-white p-8 rounded-xl shadow w-80 space-y-3" onSubmit={async ev=>{ev.preventDefault();const {error}=await sb.auth.signInWithPassword({email:e,password:p});if(error)setErr(error.message)}}>
    <h1 className="font-semibold text-lg">Investor CRM</h1>
    <input className="w-full border rounded px-3 py-2 text-sm" value={e} onChange={x=>setE(x.target.value)}/>
    <input type="password" placeholder="Password" className="w-full border rounded px-3 py-2 text-sm" value={p} onChange={x=>setP(x.target.value)}/>
    {err&&<div className="text-red-600 text-xs">{err}</div>}
    <button className="w-full bg-gray-900 text-white rounded py-2 text-sm">Sign in</button></form></div>
}

export default function App(){
  const [session,setSession]=useState(null),[ready,setReady]=useState(false)
  useEffect(()=>{sb.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)});const {data}=sb.auth.onAuthStateChange((_,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[])
  if(!ready) return null
  return session ? <CRM/> : <Login/>
}

function CRM(){
  const [rows,setRows]=useState([]),[deal,setDeal]=useState(null),[view,setView]=useState('table')
  const [q,setQ]=useState(''),[fT,setFT]=useState(''),[fR,setFR]=useState(''),[fS,setFS]=useState(''),[fP,setFP]=useState('')
  const [sort,setSort]=useState({k:'priority',d:1}),[sel,setSel]=useState(new Set()),[open,setOpen]=useState(null)
  const load=async()=>{const {data}=await sb.from('investors').select('*').order('name');setRows(data||[]);const d=await sb.from('deals').select('*').limit(1).single();setDeal(d.data)}
  useEffect(()=>{load()},[])
  const regions=useMemo(()=>[...new Set(rows.map(r=>r.region).filter(Boolean))].sort(),[rows])
  const filtered=useMemo(()=>{const s=q.toLowerCase();const pr={high:0,medium:1,low:2}
    return rows.filter(r=>(!fT||r.type===fT)&&(!fR||r.region===fR)&&(!fS||r.status===fS)&&(!fP||r.priority===fP)&&(!s||[r.name,r.company,r.evidence,r.region,(r.tags||[]).join(' ')].join(' ').toLowerCase().includes(s)))
    .sort((a,b)=>{let x=a[sort.k],y=b[sort.k];if(sort.k==='priority'){x=pr[x];y=pr[y]}if(sort.k==='status'){x=STATUSES.indexOf(x);y=STATUSES.indexOf(y)}return (x??'')>(y??'')?sort.d:(x??'')<(y??'')?-sort.d:0})},[rows,q,fT,fR,fS,fP,sort])
  const update=async(id,patch)=>{setRows(rs=>rs.map(r=>r.id===id?{...r,...patch}:r));await sb.from('investors').update({...patch,updated_at:new Date().toISOString()}).eq('id',id)}
  const setStatus=async(r,status)=>{const patch={status};if(['contacted','replied','meeting'].includes(status))patch.last_contacted_at=new Date().toISOString();await update(r.id,patch);await sb.from('activities').insert({investor_id:r.id,kind:'status',body:`Status: ${r.status} → ${status}`})}
  const bulk=async status=>{for(const id of sel){const r=rows.find(x=>x.id===id);if(r&&r.status!==status)await setStatus(r,status)}setSel(new Set())}
  const committed=rows.reduce((a,r)=>a+Number(r.committed_amount||0),0),target=Number(deal?.target_amount||1000000)
  const counts=Object.fromEntries(STATUSES.map(s=>[s,rows.filter(r=>r.status===s).length]))
  const Sel=({v,set,opts,label})=><select className="border rounded px-2 py-1.5 text-sm bg-white" value={v} onChange={e=>set(e.target.value)}><option value="">{label}</option>{opts.map(o=><option key={o}>{o}</option>)}</select>
  const Th=({k,children})=><th className="text-left font-medium px-3 py-2 cursor-pointer select-none whitespace-nowrap" onClick={()=>setSort(s=>({k,d:s.k===k?-s.d:1}))}>{children}{sort.k===k?(sort.d>0?' ↑':' ↓'):''}</th>
  const openRec=rows.find(r=>r.id===open)
  return <div className="h-screen flex flex-col bg-white text-gray-900 text-sm">
    <header className="border-b px-5 py-3 flex items-center gap-4">
      <div className="font-semibold">{deal?.name||'Investor CRM'}</div><div className="text-gray-500 text-xs">Target {fmt(target)} · min check {fmt(deal?.min_check)}</div>
      <div className="flex-1"/><button className="text-xs text-gray-500" onClick={()=>sb.auth.signOut()}>Sign out</button></header>
    <div className="px-5 py-3 border-b flex flex-wrap gap-2 items-center">
      {STATUSES.map(s=><button key={s} onClick={()=>setFS(fS===s?'':s)} className={`px-3 py-1.5 rounded-lg border text-xs ${fS===s?'ring-2 ring-gray-900':''}`}><Pill s={s}/> <b className="ml-1">{counts[s]}</b></button>)}
      <div className="ml-auto w-72"><div className="flex justify-between text-xs mb-1"><span>Committed <b>{fmt(committed)}</b></span><span className="text-gray-500">{Math.round(committed/target*100)}% of {fmt(target)}</span></div><div className="h-2 bg-gray-100 rounded"><div className="h-2 bg-green-500 rounded" style={{width:Math.min(100,committed/target*100)+'%'}}/></div></div>
    </div>
    <div className="px-5 py-2 flex flex-wrap gap-2 items-center border-b">
      <div className="flex rounded-lg border overflow-hidden">{['table','kanban'].map(v=><button key={v} onClick={()=>setView(v)} className={`px-3 py-1.5 capitalize ${view===v?'bg-gray-900 text-white':''}`}>{v}</button>)}</div>
      <input placeholder="Search name, company, evidence, tags…" className="border rounded px-3 py-1.5 w-72" value={q} onChange={e=>setQ(e.target.value)}/>
      <Sel v={fT} set={setFT} opts={TYPES} label="All types"/><Sel v={fR} set={setFR} opts={regions} label="All regions"/><Sel v={fS} set={setFS} opts={STATUSES} label="All statuses"/><Sel v={fP} set={setFP} opts={PRIOS} label="All priorities"/>
      <span className="text-gray-500 text-xs">{filtered.length} records</span>
      {sel.size>0&&<div className="ml-auto flex gap-2 items-center bg-blue-50 px-3 py-1 rounded"><span>{sel.size} selected</span><button className="bg-blue-600 text-white rounded px-3 py-1" onClick={()=>bulk('to contact')}>Mark "to contact"</button><select className="border rounded px-1 py-1 bg-white" value="" onChange={e=>e.target.value&&bulk(e.target.value)}><option value="">Set status…</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select><button onClick={()=>setSel(new Set())}>✕</button></div>}
    </div>
    <div className="flex-1 overflow-auto">
      {view==='table'?<table className="w-full"><thead className="sticky top-0 bg-gray-50 border-b text-xs text-gray-500"><tr>
        <th className="px-3"><input type="checkbox" checked={filtered.length>0&&filtered.every(r=>sel.has(r.id))} onChange={e=>setSel(e.target.checked?new Set(filtered.map(r=>r.id)):new Set())}/></th>
        <Th k="name">Name</Th><Th k="type">Type</Th><Th k="company">Company</Th><Th k="region">Region</Th><Th k="priority">Priority</Th><Th k="status">Status</Th><Th k="typical_check">Check</Th><Th k="last_contacted_at">Last contact</Th></tr></thead>
        <tbody>{filtered.map(r=><tr key={r.id} className={`border-b hover:bg-gray-50 cursor-pointer ${open===r.id?'bg-blue-50':''}`} onClick={()=>setOpen(r.id)}>
          <td className="px-3" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={sel.has(r.id)} onChange={e=>{const s=new Set(sel);e.target.checked?s.add(r.id):s.delete(r.id);setSel(s)}}/></td>
          <td className="px-3 py-2 font-medium">{r.name}</td><td className="px-3 text-gray-600 whitespace-nowrap">{r.type}</td><td className="px-3 text-gray-600 max-w-56 truncate">{r.company}</td><td className="px-3 text-gray-600 max-w-40 truncate">{r.region}</td>
          <td className={`px-3 capitalize ${PC[r.priority]}`}>{r.priority}</td><td className="px-3"><Pill s={r.status}/></td><td className="px-3 text-gray-600 max-w-40 truncate">{r.typical_check||r.est_size}</td><td className="px-3 text-gray-500 text-xs">{r.last_contacted_at?new Date(r.last_contacted_at).toLocaleDateString():''}</td></tr>)}</tbody></table>
      :<div className="flex gap-3 p-4 h-full">{STATUSES.map(s=><div key={s} className="w-64 shrink-0 bg-gray-50 rounded-lg p-2 flex flex-col" onDragOver={e=>e.preventDefault()} onDrop={e=>{const r=rows.find(x=>x.id===e.dataTransfer.getData('id'));if(r&&r.status!==s)setStatus(r,s)}}>
        <div className="flex justify-between px-1 mb-2"><Pill s={s}/><span className="text-xs text-gray-500">{filtered.filter(r=>r.status===s).length}</span></div>
        <div className="space-y-2 overflow-auto">{filtered.filter(r=>r.status===s).map(r=><div key={r.id} draggable onDragStart={e=>e.dataTransfer.setData('id',r.id)} onClick={()=>setOpen(r.id)} className="bg-white border rounded-lg p-2 cursor-pointer hover:shadow">
          <div className="font-medium">{r.name}</div><div className="text-xs text-gray-500 truncate">{r.type} · {r.region}</div><div className={`text-xs capitalize ${PC[r.priority]}`}>{r.priority}{r.committed_amount>0&&<span className="text-green-700"> · {fmt(r.committed_amount)}</span>}</div></div>)}</div></div>)}</div>}
    </div>
    {openRec&&<Panel r={openRec} onClose={()=>setOpen(null)} update={update} setStatus={setStatus}/>}
  </div>
}

function Panel({r,onClose,update,setStatus}){
  const [acts,setActs]=useState([]),[note,setNote]=useState(''),[notes,setNotes]=useState(r.owner_notes||''),[amt,setAmt]=useState(r.committed_amount||0)
  const loadA=async()=>{const {data}=await sb.from('activities').select('*').eq('investor_id',r.id).order('created_at',{ascending:false});setActs(data||[])}
  useEffect(()=>{setNotes(r.owner_notes||'');setAmt(r.committed_amount||0);loadA()},[r.id])
  useEffect(()=>{loadA()},[r.status])
  const F=({l,v})=><div className="grid grid-cols-3 gap-2 py-1.5 border-b border-gray-100"><div className="text-gray-500 text-xs">{l}</div><div className="col-span-2 text-sm break-words">{v||'—'}</div></div>
  return <div className="fixed right-0 top-0 h-full w-[520px] bg-white border-l shadow-2xl flex flex-col z-10">
    <div className="p-4 border-b flex items-start"><div className="flex-1"><div className="text-lg font-semibold">{r.name}</div><div className="text-gray-500 text-xs">{r.type} · {r.company||''}</div></div><button onClick={onClose} className="text-gray-400 text-xl">×</button></div>
    <div className="flex-1 overflow-auto p-4 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-gray-500">Status<select className="block w-full border rounded px-2 py-1 text-sm text-gray-900" value={r.status} onChange={e=>setStatus(r,e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>
        <label className="text-xs text-gray-500">Priority<select className="block w-full border rounded px-2 py-1 text-sm text-gray-900" value={r.priority} onChange={e=>update(r.id,{priority:e.target.value})}>{PRIOS.map(s=><option key={s}>{s}</option>)}</select></label>
        <label className="text-xs text-gray-500">Committed $<input type="number" className="block w-full border rounded px-2 py-1 text-sm text-gray-900" value={amt} onChange={e=>setAmt(e.target.value)} onBlur={()=>update(r.id,{committed_amount:Number(amt)||0})}/></label>
      </div>
      <div><F l="Type" v={r.type}/><F l="Company / affiliation" v={r.company}/><F l="Region" v={r.region}/><F l="Evidence" v={r.evidence}/><F l="Est. size" v={r.est_size}/><F l="Typical check" v={r.typical_check}/><F l="Contact" v={link(r.contact)}/><F l="LinkedIn" v={link(r.linkedin)}/><F l="X" v={link(r.x)}/><F l="Website" v={link(r.website)}/><F l="Source" v={link(r.source_url)}/><F l="Tags" v={(r.tags||[]).join(', ')}/><F l="Last contacted" v={r.last_contacted_at&&new Date(r.last_contacted_at).toLocaleString()}/></div>
      <div><div className="text-xs text-gray-500 mb-1">Owner notes</div><textarea className="w-full border rounded p-2 h-24" value={notes} onChange={e=>setNotes(e.target.value)} onBlur={()=>notes!==(r.owner_notes||'')&&update(r.id,{owner_notes:notes})}/></div>
      <div><div className="text-xs text-gray-500 mb-1">Activity</div>
        <div className="flex gap-2 mb-2"><input className="flex-1 border rounded px-2 py-1" placeholder="Log a call, email, note…" value={note} onChange={e=>setNote(e.target.value)} onKeyDown={async e=>{if(e.key==='Enter'&&note.trim()){await sb.from('activities').insert({investor_id:r.id,kind:'note',body:note});setNote('');loadA()}}}/></div>
        {acts.map(a=><div key={a.id} className="py-1.5 border-b border-gray-100"><div className="text-xs text-gray-400">{new Date(a.created_at).toLocaleString()} · {a.kind}</div><div>{a.body}</div></div>)}
        {!acts.length&&<div className="text-gray-400 text-xs">No activity yet</div>}</div>
    </div></div>
}
