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

// ── KAL PAYROLL SETTLEMENT ──
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

      const yr = today.getFullYear()
      const mo = today.getMonth() + 1
      const daysInMonth = new Date(yr, mo, 0).getDate()

      const emps = d.emps ? Object.values(d.emps).filter(Boolean) : []

      // Attendance: key format is att/2026_3/empId_day: 1
      const attKey = yr + '_' + mo
      const attNode = d.att ? (d.att[attKey] || {}) : {}
      const daysByEmp = {}
      Object.entries(attNode).forEach(([key, val]) => {
        if (val === 1 || val === true) {
          // key format: empId_day e.g. 1772872840230_15
          const lastUnderscore = key.lastIndexOf('_')
          if (lastUnderscore > 0) {
            const empId = key.slice(0, lastUnderscore)
            daysByEmp[empId] = (daysByEmp[empId] || 0) + 1
          }
        }
      })

      // OT: otime node keyed by empId, contains coy/party amounts
      const coyOtByEmp = {}
      const partyOtByEmp = {}
      if (d.otime) {
        Object.entries(d.otime).forEach(([empId, otData]) => {
          if (!otData || typeof otData !== 'object') return
          // Check month key
          const moKey = yr + '_' + mo
          const moData = otData[moKey] || otData[mo] || otData
          if (moData && typeof moData === 'object') {
            coyOtByEmp[empId] = (coyOtByEmp[empId] || 0) + (moData.coy || moData.company || moData.coyOt || 0)
            partyOtByEmp[empId] = (partyOtByEmp[empId] || 0) + (moData.party || moData.partyOt || 0)
          }
        })
      }

      // Advances this month
      const advs = d.adv ? Object.values(d.adv).filter(Boolean) : []
      const advByEmp = {}
      advs.forEach(a => {
        if (!a.empId) return
        const aMo = a.month || a.mon
        if (aMo && Number(aMo) !== mo) return
        advByEmp[a.empId] = (advByEmp[a.empId] || 0) + (a.amount || 0)
      })

      // Loans deduction this month
      const loans = d.loan ? Object.values(d.loan).filter(Boolean) : []
      const loanByEmp = {}
      loans.forEach(l => {
        if (!l.empId) return
        loanByEmp[l.empId] = (loanByEmp[l.empId] || 0) + (l.emi || l.deduction || 0)
      })

      // Conveyance
      const convByEmp = {}
      if (d.conv) {
        Object.values(d.conv).filter(Boolean).forEach(c => {
          if (c.empId) convByEmp[c.empId] = (convByEmp[c.empId] || 0) + (c.amount || 0)
        })
      }

      // Build settlement rows
      const rows = emps.map(e => {
        const eid = e.id || e.empId || ''
        const days = daysByEmp[eid] || 0
        const baseSal = e.type === 'fixed' ? (e.salary || 0) :
          e.type === 'monthly' ? Math.round((e.salary || 0) * days / daysInMonth) :
          e.type === 'cooking' ? Math.round((e.salary || 0) * days / daysInMonth) :
          Math.round((e.salary || 0) * days / daysInMonth)
        const coyOt = coyOtByEmp[eid] || 0
        const partyOt = partyOtByEmp[eid] || 0
        const conv = convByEmp[eid] || 0
        const gross = baseSal + coyOt + partyOt + conv
        const adv = advByEmp[eid] || 0
        const loanDed = loanByEmp[eid] || 0
        const netPay = gross - adv - loanDed
        return { name: e.name || eid, type: e.type || '—', days, baseSal, coyOt, partyOt, conv, gross, adv, loanDed, netPay }
      })

      const totalGross = rows.reduce((s, r) => s + r.gross, 0)
      const totalNet = rows.reduce((s, r) => s + r.netPay, 0)
      const totalAdv = rows.reduce((s, r) => s + r.adv, 0)

      setData({ rows, totalGross, totalNet, totalAdv, month: `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo-1]} ${yr}` })
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card
      title="KAL Payroll — Settlement" sub={`koviloor-payroll · ${data?.month || ''}`}
      badge={loading ? 'Loading…' : err ? 'Error' : (data?.rows?.length || 0) + ' staff'}
      badgeType={loading ? 'info' : err ? 'err' : 'ok'}
      error={err}
    >
      {!loading && !err && data && (
        <div className="metrics">
          <Metric label="Total gross"    value={INR(data.totalGross)} />
          <Metric label="Total advances" value={INR(data.totalAdv)} />
          <Metric label="Net payable"    value={INR(data.totalNet)} />
          <Metric label="Staff"          value={data.rows.length} />
        </div>
      )}
      <div className="table-wrap">
        <table className="settlement-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Days</th>
              <th>Base Sal</th>
              <th>Coy OT</th>
              <th>Party OT</th>
              <th>Convey</th>
              <th>Gross</th>
              <th>Advance</th>
              <th>Loan Ded</th>
              <th className="net-col">Net Pay</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr className="info-row"><td colSpan={10}>Fetching…</td></tr>}
            {!loading && !err && data?.rows?.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td style={{textAlign:'center'}}>{r.days || '—'}</td>
                <td>{r.baseSal > 0 ? INR(r.baseSal) : '—'}</td>
                <td style={{color: r.coyOt > 0 ? '#d4850b' : 'inherit'}}>{r.coyOt > 0 ? INR(r.coyOt) : '-'}</td>
                <td>{r.partyOt > 0 ? INR(r.partyOt) : '-'}</td>
                <td>{r.conv > 0 ? INR(r.conv) : '-'}</td>
                <td style={{fontWeight:500}}>{INR(r.gross)}</td>
                <td style={{color: r.adv > 0 ? '#c94040' : 'inherit'}}>{r.adv > 0 ? `(${INR(r.adv)})` : '-'}</td>
                <td style={{color: r.loanDed > 0 ? '#c94040' : 'inherit'}}>{r.loanDed > 0 ? `(${INR(r.loanDed)})` : '-'}</td>
                <td style={{fontWeight:600, color: r.netPay < 0 ? '#c94040' : '#2e7d32'}}>{INR(r.netPay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// -- KASI PAYROLL DAILY SHEET --
function KasiCard() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const mo = today.getMonth() + 1
  const yr = today.getFullYear()
  const daysInMonth = new Date(yr, mo, 0).getDate()
  const dayNums = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const monthLabel = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mo-1] + " " + yr
  const previewDays = dayNums.slice(0, 10)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const [empSnap, attSnap] = await Promise.all([
        getDocs(collection(kasiFs, "employees")),
        getDocs(collection(kasiFs, "attendance"))
      ])
      const emps = empSnap.docs.map(d => ({ _id: d.id, ...d.data() }))
      const moStr = String(mo).padStart(2,"0")
      const attMap = {}
      attSnap.docs.forEach(d => {
        const a = d.data()
        const aDate = a.date || ""
        if (!aDate.startsWith(yr + "-" + moStr)) return
        const day = parseInt(aDate.slice(8, 10))
        if (!attMap[a.empId]) attMap[a.empId] = {}
        attMap[a.empId][day] = { hrs: a.hours || a.hrs || 9, amt: a.amount || a.dailyWage || 0 }
      })
      const rows = emps.map(e => {
        const eid = e._id
        const ctc = e.salary || e.ctc || 0
        const dailyRate = Math.round(ctc / 26)
        const days = attMap[eid] || {}
        let totalHrs = 0, totalAmt = 0
        dayNums.forEach(d => { if (days[d]) { totalHrs += days[d].hrs || 9; totalAmt += days[d].amt || dailyRate } })
        return { name: e.name || eid, ctc, dailyRate, days, totalHrs, totalAmt }
      })
      const grandTotal = rows.reduce((s, r) => s + r.totalAmt, 0)
      setData({ rows, grandTotal, count: emps.length })
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card
      title="Kasi Kitchen - Daily Salary Sheet" sub={"kasi-varanasi-payroll - " + monthLabel}
      badge={loading ? "Loading..." : err ? "Error" : (data?.count || 0) + " staff"}
      badgeType={loading ? "info" : err ? "err" : "ok"}
      error={err}
    >
      {!loading && !err && data && (
        <div className="metrics">
          <Metric label="Staff" value={data.count} />
          <Metric label={monthLabel + " total"} value={INR(data.grandTotal)} />
        </div>
      )}
      <div className="table-wrap">
        <table className="settlement-table">
          <thead>
            <tr>
              <th style={{minWidth:120}}>Employee</th>
              <th>CTC</th>
              {previewDays.map(d => <th key={d} style={{minWidth:36,textAlign:"center"}}>{d}</th>)}
              <th style={{color:"#888"}}>...</th>
              <th>Hrs</th>
              <th className="net-col">Total</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr className="info-row"><td colSpan={previewDays.length + 5}>Fetching...</td></tr>}
            {!loading && !err && data?.rows?.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td style={{fontSize:11,color:"#888"}}>{r.ctc >= 1000 ? Math.round(r.ctc/1000)+"k" : r.ctc}</td>
                {previewDays.map(d => (
                  <td key={d} style={{textAlign:"center",fontSize:11}}>
                    {r.days[d] ? <span>{r.days[d].amt > 0 ? Math.round(r.days[d].amt) : r.dailyRate}</span> : <span style={{color:"#ccc"}}>-</span>}
                  </td>
                ))}
                <td style={{color:"#aaa",fontSize:11}}>...</td>
                <td style={{textAlign:"center"}}>{r.totalHrs > 0 ? r.totalHrs : "-"}</td>
                <td style={{fontWeight:600,color:"#2e7d32"}}>{r.totalAmt > 0 ? INR(r.totalAmt) : "-"}</td>
              </tr>
            ))}
            {!loading && !err && data?.rows?.length === 0 && (
              <tr className="info-row"><td colSpan={previewDays.length + 5}>No data for this month</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{fontSize:11,color:"#aaa",marginTop:6}}>Days 1-10 shown - Full sheet at kasi-payroll.vercel.app</div>
    </Card>
  )
}

// -- ANNAKSHETRA BILLS --
function AKCard() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const [billSnap, subSnap] = await Promise.all([
        getDocs(query(collection(akFs, 'ak_bills'), orderBy('billDate', 'desc'), limit(300))),
        getDocs(collection(akFs, 'ak_submissions'))
      ])
      const bills = billSnap.docs.map(d => ({ _id: d.id, ...d.data() }))
      bills.sort((a, b) => (b.billDate || '').localeCompare(a.billDate || ''))

      const subs = subSnap.docs.map(d => ({ _id: d.id, ...d.data() }))
      const subMap = {}
      subs.forEach(s => { if (s._id) subMap[s._id] = s.submissionRef || s.ref || s._id.slice(0,8) })

      const pending  = bills.filter(b => b.status === 'submitted' || b.status === 'pending')
      const approved = bills.filter(b => b.status === 'approved')
      const totalAmt = bills.reduce((s, b) => s + (b.amount || 0), 0)
      const pendAmt  = pending.reduce((s, b) => s + (b.amount || 0), 0)
      const appAmt   = approved.reduce((s, b) => s + (b.amount || 0), 0)
      const lastDate = bills.length > 0 ? bills[0].billDate : null

      // vendor-wise summary
      const vendorMap = {}
      bills.forEach(b => {
        const v = b.vendorName || 'Other'
        if (!vendorMap[v]) vendorMap[v] = { count: 0, amt: 0, pending: 0 }
        vendorMap[v].count++
        vendorMap[v].amt += b.amount || 0
        if (b.status === 'submitted' || b.status === 'pending') vendorMap[v].pending++
      })

      // category-wise summary
      const categoryMap = {}
      bills.forEach(b => {
        const c = b.categoryName || 'Other'
        if (!categoryMap[c]) categoryMap[c] = { count: 0, amt: 0, pendAmt: 0 }
        categoryMap[c].count++
        categoryMap[c].amt += b.amount || 0
        if (b.status === 'submitted' || b.status === 'pending') categoryMap[c].pendAmt += b.amount || 0
      })
      // add pendAmt to vendorMap
      Object.keys(vendorMap).forEach(v => { vendorMap[v].pendAmt = 0 })
      bills.forEach(b => {
        const v = b.vendorName || 'Other'
        if (b.status === 'submitted' || b.status === 'pending') vendorMap[v].pendAmt = (vendorMap[v].pendAmt || 0) + (b.amount || 0)
      })
      setData({ bills, pending, approved: approved.length, appAmt, totalAmt, pendAmt, subMap, lastDate, vendorMap, categoryMap, subCount: subs.length })
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card
      title="Annakshetra Bills Ledger" sub={"annakshetra-bills - Last entry: " + (data?.lastDate || '...')}
      badge={loading ? 'Loading...' : err ? 'Error' : (data?.pending?.length || 0) + ' pending'}
      badgeType={loading ? 'info' : err ? 'err' : (data?.pending?.length > 0 ? 'warn' : 'ok')}
      error={err}
    >
      <div className="metrics">
        <Metric label="Total bills"      value={loading ? '...' : data?.bills?.length ?? '-'} />
        <Metric label="Pending approval" value={loading ? '...' : data?.pending?.length ?? '-'} />
        <Metric label="Approved"         value={loading ? '...' : data?.approved ?? '-'} />
        <Metric label="Total amount"     value={loading ? '...' : INR(data?.totalAmt)} />
        <Metric label="Pending amount"   value={loading ? '...' : INR(data?.pendAmt)} />
        <Metric label="Approved amount"  value={loading ? '...' : INR(data?.appAmt)} />
        <Metric label="Submissions"      value={loading ? '...' : data?.subCount ?? '-'} />
      </div>

      <div style={{fontSize:12,fontWeight:500,color:'#555',margin:'10px 0 6px'}}>Vendor-wise summary</div>
      <div className="table-wrap" style={{marginBottom:16}}>
        <table className="settlement-table">
          <thead>
            <tr>
              <th>#</th><th>Vendor</th><th>Bills</th><th>Total Amount</th><th>Pending</th><th>Pending Amount</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr className="info-row"><td colSpan={6}>Fetching...</td></tr>}
            {!loading && !err && Object.entries(data?.vendorMap || {})
              .sort((a,b) => b[1].amt - a[1].amt)
              .map(([vendor, v], i) => (
                <tr key={i}>
                  <td style={{color:'#aaa',fontSize:11}}>{i+1}</td>
                  <td style={{fontWeight:500}}>{vendor}</td>
                  <td style={{textAlign:'center'}}>{v.count}</td>
                  <td style={{fontWeight:500}}>₹{Math.round(v.amt).toLocaleString('en-IN')}</td>
                  <td style={{textAlign:'center',color: v.pending > 0 ? '#d4850b' : '#2e7d32'}}>{v.pending}</td>
                  <td style={{fontWeight:500,color: v.pendAmt > 0 ? '#c62828' : '#2e7d32'}}>
                    {v.pendAmt > 0 ? '₹' + Math.round(v.pendAmt).toLocaleString('en-IN') : '-'}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
      <div style={{fontSize:12,fontWeight:500,color:'#555',margin:'10px 0 6px'}}>Category-wise summary</div>
      <div className="table-wrap">
        <table className="settlement-table">
          <thead>
            <tr><th>#</th><th>Category</th><th>Bills</th><th>Total Amount</th><th>Pending Amt</th></tr>
          </thead>
          <tbody>
            {!loading && !err && Object.entries(data?.categoryMap || {})
              .sort((a,b) => b[1].amt - a[1].amt)
              .map(([cat, v], i) => (
                <tr key={i}>
                  <td style={{color:'#aaa',fontSize:11}}>{i+1}</td>
                  <td>{cat}</td>
                  <td style={{textAlign:'center'}}>{v.count}</td>
                  <td>₹{Math.round(v.amt).toLocaleString('en-IN')}</td>
                  <td style={{color: v.pendAmt > 0 ? '#c62828' : '#2e7d32'}}>
                    {v.pendAmt > 0 ? '₹' + Math.round(v.pendAmt).toLocaleString('en-IN') : '-'}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// -- PROPERTY --
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
      propList.forEach(p => propMap[p.id] = p)

      const todayRevs = revList.filter(r => (r.date || r.createdAt || '').slice(0, 10) === todayStr)
      const monthRevs = revList.filter(r => (r.date || r.createdAt || '').slice(0, 7) === monthStr)
      const todayTotal = todayRevs.reduce((s, r) => s + (r.amount || r.revenue || 0), 0)
      const monthTotal = monthRevs.reduce((s, r) => s + (r.amount || r.revenue || 0), 0)

      // Revenue entries by property for today
      const todayByProp = {}
      todayRevs.forEach(r => {
        const pid = r.propertyId || r.propId || r.property
        if (pid) { todayByProp[pid] = (todayByProp[pid] || 0) + (r.amount || r.revenue || 0) }
      })

      // Arrears using exact Firebase fields: existing_arrears, expected_revenue
      const arrearList = propList
        .filter(p => (p.existing_arrears || 0) > 0)
        .map(p => ({
          ...p,
          arrAmt: p.existing_arrears || 0,
          expRev: p.expected_revenue || 0,
          freq: p.revenue_frequency || "Monthly",
          since: p.arrears_start_month || "-"
        }))
        .sort((a, b) => b.arrAmt - a.arrAmt)

      const totalArr = arrearList.reduce((s, p) => s + p.arrAmt, 0)
      const withArrears = arrearList.length

      setData({ propList, todayRevs, todayByProp, monthTotal, todayTotal, totalArr, arrearList, withArrears: arrearList.length, propMap })
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card
      title="Koviloor Property - Arrears Report" sub="koviloor-property - Realtime DB"
      badge={loading ? 'Loading...' : err ? 'Error' : (data?.propList?.length || 0) + ' properties'}
      badgeType={loading ? 'info' : err ? 'err' : 'ok'}
      error={err}
    >
      <div className="metrics">
        <Metric label="Total properties"  value={loading ? '...' : data?.propList?.length ?? '-'} />
        <Metric label="With arrears"      value={loading ? '...' : data?.withArrears ?? '-'} />
        <Metric label="Total arrears"     value={loading ? '...' : INR(data?.totalArr)} />
        <Metric label="Today's revenue"   value={loading ? '...' : INR(data?.todayTotal)} />
        <Metric label="This month"        value={loading ? '...' : INR(data?.monthTotal)} />
      </div>

      <div style={{fontSize:12,fontWeight:500,color:'#555',margin:'10px 0 6px'}}>Today's revenue entries</div>
      <div className="table-wrap" style={{marginBottom:16}}>
        <table className="settlement-table">
          <thead><tr><th>Property</th><th>Location</th><th>Amount collected</th><th>Note</th></tr></thead>
          <tbody>
            {loading && <tr className="info-row"><td colSpan={4}>Fetching...</td></tr>}
            {!loading && !err && (data?.todayRevs?.length > 0
              ? data.todayRevs.map((r, i) => {
                  const pid = r.propertyId || r.propId || r.property
                  const prop = data.propMap[pid] || {}
                  return (
                    <tr key={i}>
                      <td>{prop.name || pid || '-'}</td>
                      <td style={{color:'#888'}}>{prop.location || prop.city || '-'}</td>
                      <td style={{fontWeight:500,color:'#2e7d32'}}>{INR(r.amount || r.revenue || 0)}</td>
                      <td style={{color:'#888',fontSize:11}}>{r.note || r.description || '-'}</td>
                    </tr>
                  )
                })
              : <tr className="info-row"><td colSpan={4}>No revenue entries today</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{fontSize:12,fontWeight:500,color:'#c62828',margin:'10px 0 6px'}}>
        Arrears statement — {loading ? '...' : data?.withArrears} properties | {loading ? '...' : INR(data?.totalArr)} total
      </div>
      <div className="table-wrap">
        <table className="settlement-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Property Name</th>
              <th>Location</th>
              <th>Expected Rev</th>
              <th>Frequency</th>
              <th>Arrears Amount</th>
              <th>Months unpaid</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr className="info-row"><td colSpan={8}>Fetching...</td></tr>}
            {!loading && !err && data?.arrearList?.length === 0 && (
              <tr className="info-row"><td colSpan={8}>No arrears on record</td></tr>
            )}
            {!loading && !err && data?.arrearList?.map((p, i) => {
              const months = p.expRev > 0 ? Math.round(p.arrAmt / p.expRev) : null
              return (
                <tr key={i}>
                  <td style={{color:'#aaa',fontSize:11}}>{i+1}</td>
                  <td style={{fontWeight:500}}>{p.name || p.title || p.id}</td>
                  <td style={{color:'#888'}}>{p.location || '-'}</td>
                  <td>{p.expRev > 0 ? INR(p.expRev) : '-'}</td>
                  <td><span className="badge badge-info" style={{fontSize:10}}>{p.freq}</span></td>
                  <td style={{fontWeight:600,color:'#c62828'}}>{INR(p.arrAmt)}</td>
                  <td style={{textAlign:'center',color: months > 3 ? '#c62828' : '#d4850b'}}>
                    {months ? months + ' mo' : '-'}
                  </td>
                  <td style={{color:'#888',fontSize:11}}>{p.since}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
