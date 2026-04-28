import { useState, useEffect, useCallback } from 'react'
import { ref, get } from 'firebase/database'
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore'
import { kalDb, propDb, kasiFs, akFs } from './firebase'
import './App.css'

const INR = n => (n != null && !isNaN(n)) ? '₹' + Math.round(n).toLocaleString('en-IN') : '—'
const today = new Date()
const todayStr = today.toISOString().slice(0, 10)
const monthStr = today.toISOString().slice(0, 7)

function Badge({ text, type }) {
  return <span className={`badge badge-${type}`}>{text}</span>
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="section">
      <div className="section-title">{title}</div>
      {children}
    </div>
  )
}

function Card({ title, sub, badge, badgeType, children, error }) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-sub">{sub}</div>
        </div>
        <Badge text={badge} type={badgeType || 'info'} />
      </div>
      {children}
      {error && <div className="err-msg">Error: {error}</div>}
    </div>
  )
}

// ── KAL PAYROLL ──
function KalCard() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const snap = await get(ref(kalDb, '/kal'))
      const d = snap.val()
      if (!d) { setErr('No data at /kal'); setLoading(false); return }

      const emps = d.emps ? Object.values(d.emps).filter(Boolean) : []
      const loans = d.loan ? Object.values(d.loan).filter(Boolean) : []
      const advs  = d.adv  ? Object.values(d.adv).filter(Boolean)  : []
      const activeLoans = loans.filter(l => (l.balance || l.remaining || l.amount || 0) > 0)
      const activeAdv   = advs.filter(a => (a.amount || 0) > 0)
      const otCount = d.otime ? Object.keys(d.otime).length : 0

      const loanByEmp = {}
      loans.forEach(l => { if (l.empId) loanByEmp[l.empId] = (loanByEmp[l.empId] || 0) + (l.balance || l.remaining || l.amount || 0) })
      const advByEmp = {}
      advs.forEach(a => { if (a.empId) advByEmp[a.empId] = (advByEmp[a.empId] || 0) + (a.amount || 0) })

      setData({ emps, activeLoans, activeAdv, otCount, loanByEmp, advByEmp })
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const empCount = data?.emps?.length || 0
  return (
    <Card
      title="KAL Payroll" sub="koviloor-payroll · Realtime DB"
      badge={loading ? 'Loading…' : err ? 'Error' : empCount + ' staff'}
      badgeType={loading ? 'info' : err ? 'err' : 'ok'}
      error={err}
    >
      <div className="metrics">
        <Metric label="Employees"      value={loading ? '…' : empCount} />
        <Metric label="Active loans"   value={loading ? '…' : data?.activeLoans?.length ?? '—'} />
        <Metric label="Active advances" value={loading ? '…' : data?.activeAdv?.length ?? '—'} />
        <Metric label="OT entries"     value={loading ? '…' : data?.otCount ?? '—'} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Type</th><th>Loan bal</th><th>Advance bal</th></tr></thead>
          <tbody>
            {loading && <tr className="info-row"><td colSpan={4}>Fetching…</td></tr>}
            {!loading && !err && data?.emps?.slice(0, 15).map((e, i) => {
              const lb = data.loanByEmp[e.id || e.empId] || 0
              const ab = data.advByEmp[e.id || e.empId] || 0
              return (
                <tr key={i}>
                  <td><span className={`dot ${lb > 0 || ab > 0 ? 'dot-amber' : 'dot-green'}`}></span>{e.name || e.id || '—'}</td>
                  <td>{e.type || '—'}</td>
                  <td>{lb > 0 ? INR(lb) : '—'}</td>
                  <td>{ab > 0 ? INR(ab) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── KASI PAYROLL ──
function KasiCard() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const [empSnap, advSnap, loanSnap] = await Promise.all([
        getDocs(collection(kasiFs, 'employees')),
        getDocs(collection(kasiFs, 'advances')),
        getDocs(collection(kasiFs, 'loans'))
      ])
      const emps  = empSnap.docs.map(d  => ({ _id: d.id, ...d.data() }))
      const advs  = advSnap.docs.map(d  => ({ _id: d.id, ...d.data() }))
      const loans = loanSnap.docs.map(d => ({ _id: d.id, ...d.data() }))

      const activeAdv   = advs.filter(a  => !a.deducted && (a.amount || 0) > 0)
      const activeLoans = loans.filter(l => (l.balance || l.remaining || 0) > 0)

      const advByEmp = {}
      activeAdv.forEach(a => { if (a.empId) advByEmp[a.empId] = (advByEmp[a.empId] || 0) + (a.amount || 0) })

      let totalDaily = 0
      emps.forEach(e => { if (e.salary) totalDaily += e.salary / 26 })

      setData({ emps, activeAdv, activeLoans, advByEmp, totalDaily })
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card
      title="Kasi Varanasi Payroll" sub="kasi-varanasi-payroll · Firestore"
      badge={loading ? 'Loading…' : err ? 'Error' : (data?.emps?.length || 0) + ' staff'}
      badgeType={loading ? 'info' : err ? 'err' : 'ok'}
      error={err}
    >
      <div className="metrics">
        <Metric label="Employees"      value={loading ? '…' : data?.emps?.length ?? '—'} />
        <Metric label="Active advances" value={loading ? '…' : data?.activeAdv?.length ?? '—'} />
        <Metric label="Active loans"   value={loading ? '…' : data?.activeLoans?.length ?? '—'} />
        <Metric label="Est. daily wages" value={loading ? '…' : INR(data?.totalDaily)} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Daily rate (÷26)</th><th>Advance pending</th></tr></thead>
          <tbody>
            {loading && <tr className="info-row"><td colSpan={3}>Fetching…</td></tr>}
            {!loading && !err && data?.emps?.slice(0, 15).map((e, i) => (
              <tr key={i}>
                <td>{e.name || e._id}</td>
                <td>{e.salary ? INR(e.salary / 26) : '—'}</td>
                <td>{data.advByEmp[e._id] > 0 ? INR(data.advByEmp[e._id]) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── ANNAKSHETRA BILLS ──
function AKCard() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const [billSnap, subSnap] = await Promise.all([
        getDocs(query(collection(akFs, 'ak_bills'), orderBy('billDate', 'desc'), limit(200))),
        getDocs(collection(akFs, 'ak_submissions'))
      ])
      const bills = billSnap.docs.map(d => ({ _id: d.id, ...d.data() }))
      const subs  = subSnap.size

      const pending  = bills.filter(b => b.status === 'submitted' || b.status === 'pending')
      const approved = bills.filter(b => b.status === 'approved').length
      const totalAmt = bills.reduce((s, b) => s + (b.amount || 0), 0)
      const pendAmt  = pending.reduce((s, b) => s + (b.amount || 0), 0)

      setData({ bills, pending, approved, totalAmt, pendAmt, subs })
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card
      title="Annakshetra Bills" sub="annakshetra-bills · Firestore"
      badge={loading ? 'Loading…' : err ? 'Error' : (data?.pending?.length || 0) + ' pending'}
      badgeType={loading ? 'info' : err ? 'err' : (data?.pending?.length > 0 ? 'warn' : 'ok')}
      error={err}
    >
      <div className="metrics">
        <Metric label="Total bills"     value={loading ? '…' : data?.bills?.length ?? '—'} />
        <Metric label="Pending approval" value={loading ? '…' : data?.pending?.length ?? '—'} />
        <Metric label="Approved"        value={loading ? '…' : data?.approved ?? '—'} />
        <Metric label="Total amount"    value={loading ? '…' : INR(data?.totalAmt)} />
        <Metric label="Pending amount"  value={loading ? '…' : INR(data?.pendAmt)} />
        <Metric label="Submissions"     value={loading ? '…' : data?.subs ?? '—'} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Bill no</th><th>Date</th><th>Vendor</th><th>Category</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {loading && <tr className="info-row"><td colSpan={6}>Fetching…</td></tr>}
            {!loading && !err && data?.bills?.slice(0, 15).map((b, i) => {
              const st = b.status || '—'
              const bc = st === 'approved' ? 'ok' : (st === 'submitted' || st === 'pending') ? 'warn' : 'info'
              return (
                <tr key={i}>
                  <td>{b.billNo || '—'}</td>
                  <td>{b.billDate || '—'}</td>
                  <td>{b.vendorName || '—'}</td>
                  <td>{b.categoryName || '—'}</td>
                  <td>₹{(b.amount || 0).toLocaleString('en-IN')}</td>
                  <td><span className={`badge badge-${bc}`}>{st}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── PROPERTY ──
function PropCard() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const [propSnap, revSnap] = await Promise.all([
        get(ref(propDb, '/properties')),
        get(ref(propDb, '/revenues'))
      ])
      const props = propSnap.val() || {}
      const revs  = revSnap.val()  || {}

      const propList = Object.entries(props).map(([k, v]) => ({ id: k, ...(typeof v === 'object' ? v : { name: String(v) }) }))
      const revList  = Object.entries(revs).map(([k, v])  => ({ id: k, ...(typeof v === 'object' ? v : {}) }))

      const propMap = {}
      propList.forEach(p => propMap[p.id] = p.name || p.title || p.id)

      const todayRevs = revList.filter(r => (r.date || r.createdAt || '').slice(0, 10) === todayStr)
      const monthRevs = revList.filter(r => (r.date || r.createdAt || '').slice(0, 7) === monthStr)
      const todayTotal = todayRevs.reduce((s, r) => s + (r.amount || r.revenue || 0), 0)
      const monthTotal = monthRevs.reduce((s, r) => s + (r.amount || r.revenue || 0), 0)

      const arrearList = propList.filter(p => (p.arrears || p.balance || p.due || p.arrear || 0) > 0)
      const totalArr   = arrearList.reduce((s, p) => s + (p.arrears || p.balance || p.due || p.arrear || 0), 0)

      setData({ propList, todayRevs, monthTotal, todayTotal, totalArr, arrearList, propMap })
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card
      title="Koviloor Property" sub="koviloor-property · Realtime DB"
      badge={loading ? 'Loading…' : err ? 'Error' : (data?.propList?.length || 0) + ' properties'}
      badgeType={loading ? 'info' : err ? 'err' : 'ok'}
      error={err}
    >
      <div className="metrics">
        <Metric label="Properties"    value={loading ? '…' : data?.propList?.length ?? '—'} />
        <Metric label="Today's revenue" value={loading ? '…' : INR(data?.todayTotal)} />
        <Metric label="This month"    value={loading ? '…' : INR(data?.monthTotal)} />
        <Metric label="Arrears"       value={loading ? '…' : INR(data?.totalArr)} />
      </div>
      <div className="two-col">
        <div>
          <div className="sub-title">Today's entries</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Property</th><th>Amount</th><th>Note</th></tr></thead>
              <tbody>
                {loading && <tr className="info-row"><td colSpan={3}>Fetching…</td></tr>}
                {!loading && !err && (data?.todayRevs?.length > 0
                  ? data.todayRevs.map((r, i) => (
                      <tr key={i}>
                        <td>{data.propMap[r.propertyId || r.propId] || r.propertyId || '—'}</td>
                        <td>{INR(r.amount || r.revenue || 0)}</td>
                        <td>{r.note || r.description || '—'}</td>
                      </tr>
                    ))
                  : <tr className="info-row"><td colSpan={3}>No entries today</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="sub-title">Arrears statement</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Property</th><th>Due</th></tr></thead>
              <tbody>
                {loading && <tr className="info-row"><td colSpan={2}>Fetching…</td></tr>}
                {!loading && !err && (data?.arrearList?.length > 0
                  ? data.arrearList.slice(0, 10).map((p, i) => {
                      const due = p.arrears || p.balance || p.due || p.arrear || 0
                      return (
                        <tr key={i}>
                          <td><span className={`dot ${due > 10000 ? 'dot-red' : 'dot-amber'}`}></span>{p.name || p.title || p.id}</td>
                          <td>{INR(due)}</td>
                        </tr>
                      )
                    })
                  : <tr className="info-row"><td colSpan={2}>No arrears on record</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── ROOT APP ──
export default function App() {
  const [tick, setTick] = useState(0)
  const [lastUpdated, setLastUpdated] = useState('')

  const refresh = () => {
    setTick(t => t + 1)
    setLastUpdated(new Date().toLocaleTimeString('en-IN'))
  }

  useEffect(() => {
    setLastUpdated(new Date().toLocaleTimeString('en-IN'))
  }, [])

  return (
    <div className="app">
      <div className="top-bar">
        <div>
          <h1>Morning dashboard</h1>
          <p>{today.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <button className="refresh-btn" onClick={refresh}>↻ Refresh</button>
      </div>

      <Section title="KAL Catering Payroll — Settlement"><KalCard key={`kal-${tick}`} /></Section>
      <Section title="Kasi Kitchen Payroll — Daily Salary"><KasiCard key={`kasi-${tick}`} /></Section>
      <Section title="Annakshetra Bills — Pending & Ledger"><AKCard key={`ak-${tick}`} /></Section>
      <Section title="Property Management — Revenue & Arrears"><PropCard key={`prop-${tick}`} /></Section>

      {lastUpdated && <div className="timestamp">Last updated: {lastUpdated}</div>}
    </div>
  )
}
