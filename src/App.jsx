import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const sb = createClient('https://uqfvqzmhlipxviumuhlb.supabase.co', 'sb_publishable_ek9FzdFei3m3fMTiRctDXg_zNmizBud')

const STATUSES = ['не связывались', 'связаться', 'связались', 'ответили', 'встреча', 'коммит', 'отказ']
const TYPES = ['сотрудник/alumni', 'family office', 'фонд', 'синдикат', 'синдикат/канал', 'angel', 'платформа']
const PRIOS = ['высокий', 'средний', 'низкий']

const STATUS_COLORS = {
  'не связывались': ['#f1f1ef', '#5f5e5b', '#9b9a97'],
  'связаться': ['#e7f0fd', '#1f5fbf', '#2f6fec'],
  'связались': ['#e6f5f3', '#18736a', '#22a094'],
  'ответили': ['#e3f4ea', '#1f7a46', '#2e9e5e'],
  'встреча': ['#f1eafb', '#6b3fb0', '#8c5bd6'],
  'коммит': ['#dff3e6', '#14532d', '#16a34a'],
  'отказ': ['#fbe9e8', '#a93a35', '#d44c47']
}

const PC = { 'высокий': '#d44c47', 'средний': '#e08a2c', 'низкий': '#91918e' }

const fmt = n => '$' + Number(n || 0).toLocaleString()

const Pill = ({ s }) => {
  const [bg, fg, dot] = STATUS_COLORS[s] || ['#f1f1ef', '#5f5e5b', '#9b9a97']
  return <span className="pill click" style={{ background: bg, color: fg }}>
    <span className="dot" style={{ background: dot }}></span>{s}
  </span>
}

const avatar = (r) => {
  if (!r || !r.name) return <span className="av">?</span>
  const ini = r.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['#e07a5f', '#3d85c6', '#6aa84f', '#8e7cc3', '#e69138', '#45818e', '#c27ba0', '#7f6000']
  let h = 0
  for (let i = 0; i < r.name.length; i++) h = (h * 31 + r.name.charCodeAt(i)) >>> 0
  return <span className="av ini" style={{ background: colors[h % colors.length] }}>{ini}</span>
}

function Login() {
  const [e, setE] = useState('tigran@investor-crm.app')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  
  return <div className="login-wrap">
    <div className="login-box">
      <h1>Investor CRM</h1>
      <div className="sub">Together AI SPV</div>
      <form onSubmit={async ev => {
        ev.preventDefault()
        const { error } = await sb.auth.signInWithPassword({ email: e, password: p })
        if (error) setErr(error.message)
      }}>
        <input value={e} onChange={x => setE(x.target.value)} placeholder="Email" />
        <input type="password" placeholder="Пароль" value={p} onChange={x => setP(x.target.value)} />
        {err && <div className="err">{err}</div>}
        <button type="submit">Войти</button>
      </form>
    </div>
  </div>
}

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = sb.auth.onAuthStateChange((_, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  
  if (!ready) return null
  return session ? <CRM /> : <Login />
}

function CRM() {
  const [rows, setRows] = useState([])
  const [deal, setDeal] = useState(null)
  const [view, setView] = useState('table')
  const [q, setQ] = useState('')
  const [fT, setFT] = useState('')
  const [fR, setFR] = useState('')
  const [fS, setFS] = useState('')
  const [fP, setFP] = useState('')
  const [sort, setSort] = useState({ k: 'priority', d: 1 })
  const [sel, setSel] = useState(new Set())
  const [open, setOpen] = useState(null)
  const [menuState, setMenuState] = useState(null)
  
  const load = async () => {
    const { data } = await sb.from('investors').select('*').order('name')
    setRows(data || [])
    const d = await sb.from('deals').select('*').limit(1).single()
    setDeal(d.data)
  }
  
  useEffect(() => { load() }, [])
  
  const regions = useMemo(() => [...new Set(rows.map(r => r.region).filter(Boolean))].sort(), [rows])
  
  const filtered = useMemo(() => {
    const s = q.toLowerCase()
    const pr = { 'высокий': 0, 'средний': 1, 'низкий': 2 }
    return rows.filter(r => (!fT || r.type === fT) && (!fR || r.region === fR) && (!fS || r.status === fS) && (!fP || r.priority === fP) && (!s || [r.name, r.company, r.evidence, r.region, (r.tags || []).join(' ')].join(' ').toLowerCase().includes(s)))
      .sort((a, b) => {
        let x = a[sort.k], y = b[sort.k]
        if (sort.k === 'priority') { x = pr[x]; y = pr[y] }
        if (sort.k === 'status') { x = STATUSES.indexOf(x); y = STATUSES.indexOf(y) }
        return (x ?? '') > (y ?? '') ? sort.d : (x ?? '') < (y ?? '') ? -sort.d : 0
      })
  }, [rows, q, fT, fR, fS, fP, sort])
  
  const update = async (id, patch) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
    await sb.from('investors').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  }
  
  const setStatus = async (r, status) => {
    const patch = { status }
    if (['связались', 'ответили', 'встреча'].includes(status)) patch.last_contacted_at = new Date().toISOString()
    await update(r.id, patch)
    await sb.from('activities').insert({ investor_id: r.id, kind: 'status', body: `Статус: ${r.status} → ${status}` })
    setMenuState(null)
  }
  
  const bulk = async status => {
    for (const id of sel) {
      const r = rows.find(x => x.id === id)
      if (r && r.status !== status) await setStatus(r, status)
    }
    setSel(new Set())
  }
  
  const committed = rows.reduce((a, r) => a + Number(r.committed_amount || 0), 0)
  const target = Number(deal?.target_amount || 1000000)
  const counts = Object.fromEntries(STATUSES.map(s => [s, rows.filter(r => r.status === s).length]))
  
  const Sel = ({ v, set, opts, label }) => <select className="f" value={v} onChange={e => set(e.target.value)}>
    <option value="">{label}</option>
    {opts.map(o => <option key={o}>{o}</option>)}
  </select>
  
  const Th = ({ k, children }) => <th onClick={() => setSort(s => ({ k, d: s.k === k ? -s.d : 1 }))}>
    {children}<span className="arr">{sort.k === k ? (sort.d > 0 ? ' ↑' : ' ↓') : ''}</span>
  </th>
  
  const openRec = rows.find(r => r.id === open)
  
  return <div className="app">
    <aside className="sidebar">
      <div className="ws">
        <div className="ws-logo">M</div>
        <div>
          <div className="ws-name">Matrix Capital</div>
          <div className="ws-sub">Emerging managers CRM</div>
        </div>
      </div>
      <div className="sb-h">Представления</div>
      <button className={`sb-item ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')}>
        <span className="ic">▦</span>Таблица
      </button>
      <button className={`sb-item ${view === 'kanban' ? 'active' : ''}`} onClick={() => setView('kanban')}>
        <span className="ic">▥</span>Канбан
      </button>
      <div className="sb-h">Быстрые фильтры</div>
      <button className="sb-item" onClick={() => { setFS(''); setFT(''); setFR(''); setFP(''); setQ('') }}>
        <span className="ic">◎</span>Все фонды<span className="cnt">{rows.length}</span>
      </button>
      {STATUSES.map(s => <button key={s} className={`sb-item ${fS === s ? 'active' : ''}`} onClick={() => setFS(fS === s ? '' : s)}>
        <span className="ic">●</span>{s}<span className="cnt">{counts[s]}</span>
      </button>)}
      <div className="sb-foot">
        <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => sb.auth.signOut()}>Выйти</button>
      </div>
    </aside>
    
    <main className="main">
      <div className="topbar">
        <span className="crumb">Matrix Capital / Fund of Funds / <b>LP outreach</b></span>
      </div>
      <div className="title">🧭 Emerging managers: outreach</div>
      <div className="subtitle">
        {deal?.name || 'Investor CRM'} · Цель {fmt(target)} · мин чек {fmt(deal?.min_check)}
      </div>
      
      <div className="stats">
        <div className="stat">
          <div className="k">✉️ Всего написали</div>
          <div className="v">{rows.filter(r => r.status !== 'не связывались').length}</div>
        </div>
        <div className="stat">
          <div className="k">💬 Ответили</div>
          <div className="v">{rows.filter(r => r.status === 'ответили' || r.status === 'встреча' || r.status === 'коммит').length}</div>
        </div>
        <div className="stat">
          <div className="k">📈 Доля ответов</div>
          <div className="v">{rows.filter(r => r.status !== 'не связывались').length ? Math.round(rows.filter(r => ['ответили', 'встреча', 'коммит'].includes(r.status)).length / rows.filter(r => r.status !== 'не связывались').length * 100) : 0}%</div>
        </div>
        <div className="stat">
          <div className="k">📞 Созвоны / DD</div>
          <div className="v">{rows.filter(r => r.status === 'встреча').length}</div>
        </div>
        <div className="stat warn">
          <div className="k">⏰ Ждём ответа</div>
          <div className="v">{rows.filter(r => r.status === 'связались').length}</div>
        </div>
      </div>
      
      <div className="toolbar">
        <div className="tabs">
          <button className={`tab ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')}>▦ Таблица</button>
          <button className={`tab ${view === 'kanban' ? 'active' : ''}`} onClick={() => setView('kanban')}>▥ Канбан</button>
        </div>
        <div className="search">
          <span className="muted">⌕</span>
          <input placeholder="Поиск: имя, компания, заметки…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Sel v={fT} set={setFT} opts={TYPES} label="Все типы" />
        <Sel v={fR} set={setFR} opts={regions} label="Все регионы" />
        <Sel v={fS} set={setFS} opts={STATUSES} label="Все статусы" />
        <Sel v={fP} set={setFP} opts={PRIOS} label="Все приоритеты" />
        <span className="spacer"></span>
        <span style={{ color: 'var(--text3)', fontSize: 12 }}>{filtered.length} записей</span>
      </div>
      
      <div className="content">
        {view === 'table' ? <TableView 
          rows={filtered} 
          sort={sort} 
          setSort={setSort} 
          sel={sel} 
          setSel={setSel} 
          setOpen={setOpen}
          setMenuState={setMenuState}
          Th={Th}
        /> : <KanbanView 
          rows={filtered} 
          setStatus={setStatus}
          setOpen={setOpen}
        />}
        
        {sel.size > 0 && <div className="bulk-bar">
          <span>{sel.size} выбрано</span>
          <select value="" onChange={e => e.target.value && bulk(e.target.value)}>
            <option value="">Изменить статус…</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => setSel(new Set())}>✕</button>
        </div>}
        
        <div style={{ padding: '0 24px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--text2)' }}>
            <span>Коммит <b>{fmt(committed)}</b></span>
            <span style={{ color: 'var(--text3)' }}>{Math.round(committed / target * 100)}% от {fmt(target)}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: Math.min(100, committed / target * 100) + '%' }}></div>
          </div>
        </div>
      </div>
    </main>
    
    <div className={`scrim ${openRec ? 'show' : ''}`} onClick={() => setOpen(null)}></div>
    {openRec && <Panel r={openRec} onClose={() => setOpen(null)} update={update} setStatus={setStatus} />}
    {menuState && <StatusMenu {...menuState} onClose={() => setMenuState(null)} onSelect={setStatus} />}
  </div>
}

function TableView({ rows, sort, setSort, sel, setSel, setOpen, setMenuState, Th }) {
  if (!rows.length) return <div className="empty">Ничего не найдено. Попробуйте изменить фильтры.</div>
  
  return <table className="grid">
    <thead>
      <tr>
        <th style={{ width: 40 }}>
          <input type="checkbox" checked={rows.length > 0 && rows.every(r => sel.has(r.id))} onChange={e => setSel(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} />
        </th>
        <Th k="name">Имя</Th>
        <Th k="type">Тип</Th>
        <Th k="company">Компания</Th>
        <Th k="region">Регион</Th>
        <Th k="priority">Приоритет</Th>
        <Th k="status">Статус</Th>
        <Th k="typical_check">Чек</Th>
        <Th k="last_contacted_at">Последний контакт</Th>
      </tr>
    </thead>
    <tbody>
      {rows.map(r => <tr key={r.id} onClick={() => setOpen(r.id)} style={{ cursor: 'pointer' }}>
        <td onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={sel.has(r.id)} onChange={e => {
            const s = new Set(sel)
            e.target.checked ? s.add(r.id) : s.delete(r.id)
            setSel(s)
          }} />
        </td>
        <td>
          <div className="fundcell">
            {avatar(r)}
            <span className="fundname">{r.name}</span>
          </div>
        </td>
        <td><span className="tag">{r.type}</span></td>
        <td><span className="ell" style={{ maxWidth: 200 }}>{r.company}</span></td>
        <td><span className="ell" style={{ maxWidth: 150 }}>{r.region}</span></td>
        <td style={{ color: PC[r.priority] }}>{r.priority}</td>
        <td onClick={e => { e.stopPropagation(); setMenuState({ r, anchor: e.currentTarget }) }}>
          <Pill s={r.status} />
        </td>
        <td>{r.typical_check || r.est_size}</td>
        <td style={{ color: 'var(--text3)', fontSize: 12 }}>
          {r.last_contacted_at ? new Date(r.last_contacted_at).toLocaleDateString('ru') : ''}
        </td>
      </tr>)}
    </tbody>
  </table>
}

function KanbanView({ rows, setStatus, setOpen }) {
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  
  return <div className="board">
    {STATUSES.map(s => {
      const items = rows.filter(r => r.status === s)
      return <div key={s} className={`col ${overCol === s ? 'over' : ''}`}
        onDragOver={e => { e.preventDefault(); setOverCol(s) }}
        onDragLeave={() => setOverCol(null)}
        onDrop={e => {
          e.preventDefault()
          setOverCol(null)
          const r = rows.find(x => x.id === dragId)
          if (r && r.status !== s) setStatus(r, s)
        }}>
        <div className="col-h">
          <Pill s={s} />
          <span className="n">{items.length}</span>
        </div>
        <div className="cards">
          {items.map(r => <div key={r.id} className="card" draggable
            onDragStart={() => setDragId(r.id)}
            onDragEnd={() => { setDragId(null); setOverCol(null) }}
            onClick={() => setOpen(r.id)}>
            <div className="card-t">
              {avatar(r)}
              <span>{r.name}</span>
            </div>
            {r.evidence && <div className="card-s">{r.evidence}</div>}
            <div className="card-m">
              {r.type && <span>🏷 {r.type}</span>}
              {r.region && <span>📍 {r.region}</span>}
              {r.priority && <span style={{ color: PC[r.priority] }}>⚡ {r.priority}</span>}
              {r.committed_amount > 0 && <span style={{ color: '#16a34a' }}>💰 {fmt(r.committed_amount)}</span>}
            </div>
          </div>)}
        </div>
      </div>
    })}
  </div>
}

function StatusMenu({ r, anchor, onClose, onSelect }) {
  const [pos, setPos] = useState({ top: 0, left: 0 })
  
  useEffect(() => {
    if (anchor) {
      const rect = anchor.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
  }, [anchor])
  
  useEffect(() => {
    const handler = () => onClose()
    setTimeout(() => document.addEventListener('click', handler), 0)
    return () => document.removeEventListener('click', handler)
  }, [onClose])
  
  return <div className="menu" style={{ top: pos.top, left: pos.left }}>
    {STATUSES.map(s => <div key={s} className="mi" onClick={() => onSelect(r, s)}>
      <Pill s={s} />
      {s === r.status && <span className="muted">✓</span>}
    </div>)}
  </div>
}

function Panel({ r, onClose, update, setStatus }) {
  const [acts, setActs] = useState([])
  const [note, setNote] = useState('')
  const [notes, setNotes] = useState(r.owner_notes || '')
  const [amt, setAmt] = useState(r.committed_amount || 0)
  const [editField, setEditField] = useState(null)
  
  const loadA = async () => {
    const { data } = await sb.from('activities').select('*').eq('investor_id', r.id).order('created_at', { ascending: false })
    setActs(data || [])
  }
  
  useEffect(() => {
    setNotes(r.owner_notes || '')
    setAmt(r.committed_amount || 0)
    loadA()
  }, [r.id])
  
  const prop = (k, v) => <><div className="pk">{k}</div><div className="pv">{v || <span className="muted">—</span>}</div></>
  
  return <aside className="panel show">
    <div className="p-top">
      <button className="btn" onClick={onClose}>✕ Закрыть</button>
      <span className="spacer"></span>
      <button className="btn danger" onClick={async () => {
        if (confirm(`Удалить ${r.name}?`)) {
          await sb.from('investors').delete().eq('id', r.id)
          onClose()
          window.location.reload()
        }
      }}>Удалить</button>
    </div>
    <div className="p-body">
      <div className="p-title">
        {avatar(r)}
        <span>{r.name}</span>
      </div>
      <div style={{ marginBottom: 12 }}>
        <Pill s={r.status} />
      </div>
      
      <div className="props">
        {prop('Тип', r.type)}
        {prop('Компания', r.company)}
        {prop('Регион', r.region)}
        {prop('Приоритет', <select value={r.priority} onChange={e => update(r.id, { priority: e.target.value })} style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px' }}>
          {PRIOS.map(p => <option key={p}>{p}</option>)}
        </select>)}
        {prop('Evidence', r.evidence)}
        {prop('Est. size', r.est_size)}
        {prop('Typical check', r.typical_check)}
        {prop('Contact', r.contact)}
        {prop('LinkedIn', r.linkedin ? <a href={r.linkedin} target="_blank" rel="noopener">↗ Открыть</a> : null)}
        {prop('X', r.x ? <a href={r.x} target="_blank" rel="noopener">↗ Открыть</a> : null)}
        {prop('Website', r.website ? <a href={r.website} target="_blank" rel="noopener">↗ Открыть</a> : null)}
        {prop('Source', r.source_url ? <a href={r.source_url} target="_blank" rel="noopener">↗ Открыть</a> : r.source_url)}
        {prop('Tags', (r.tags || []).join(', '))}
        {prop('Последний контакт', r.last_contacted_at && new Date(r.last_contacted_at).toLocaleString('ru'))}
      </div>
      
      <div className="sec-h">Статус</div>
      <div style={{ marginBottom: 16 }}>
        <select className="f" value={r.status} onChange={e => setStatus(r, e.target.value)} style={{ width: '100%' }}>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      
      <div className="sec-h">Коммит ($)</div>
      <input type="number" className="edit-input" value={amt} onChange={e => setAmt(e.target.value)}
        onBlur={() => update(r.id, { committed_amount: Number(amt) || 0 })} style={{ marginBottom: 16 }} />
      
      <div className="sec-h">Заметки владельца</div>
      {editField === 'notes' ? <textarea className="edit-input" value={notes} onChange={e => setNotes(e.target.value)}
        onBlur={() => { update(r.id, { owner_notes: notes }); setEditField(null) }} autoFocus /> :
        <div className="summary" onClick={() => setEditField('notes')}>{notes || 'Нажмите, чтобы добавить заметки'}</div>}
      
      <div className="sec-h">Активность</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input className="f" style={{ flex: 1 }} placeholder="Добавить заметку о звонке, email…" value={note} onChange={e => setNote(e.target.value)}
          onKeyDown={async e => {
            if (e.key === 'Enter' && note.trim()) {
              await sb.from('activities').insert({ investor_id: r.id, kind: 'note', body: note })
              setNote('')
              loadA()
            }
          }} />
      </div>
      <div className="tl">
        {acts.map(a => <div key={a.id} className="tl-i status">
          <div className="tl-d">{new Date(a.created_at).toLocaleString('ru')} · {a.kind}</div>
          <div className="tl-t">{a.body}</div>
        </div>)}
        {!acts.length && <div className="muted">Нет активности</div>}
      </div>
    </div>
  </aside>
}
