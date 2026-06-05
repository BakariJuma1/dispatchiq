import { useEffect, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../context/AuthContext'
import { useWeather } from '../context/WeatherContext'
import { getHourlyForecast } from '../services/weatherService'
import {
  getRiderSafetyStatus,
  getHourlyRiskBlocks,
  getImpactEstimate,
} from '../utils/dispatchLogic'
import Navbar from '../components/Navbar'

// ─── Command status map ───────────────────────────────────────────────────────
// Every colour decision on the page derives from one of these three states.

const CMD = {
  GREEN: {
    label:   'CLEAR TO DISPATCH',
    color:   'text-green-400',
    dim:     'text-green-400/70',
    border:  'border-green-500/30',
    bg:      'bg-green-500/5',
    glow:    'shadow-green-500/10',
    dot:     'bg-green-400',
    badge:   'bg-green-500/15 text-green-400 border-green-500/30',
  },
  AMBER: {
    label:   'DISPATCH WITH CAUTION',
    color:   'text-amber-400',
    dim:     'text-amber-400/70',
    border:  'border-amber-400/30',
    bg:      'bg-amber-400/5',
    glow:    'shadow-amber-400/10',
    dot:     'bg-amber-400',
    badge:   'bg-amber-400/15 text-amber-300 border-amber-400/30',
  },
  RED: {
    label:   'HOLD DISPATCH',
    color:   'text-red-500',
    dim:     'text-red-400/70',
    border:  'border-red-500/40',
    bg:      'bg-red-500/8',
    glow:    'shadow-red-500/15',
    dot:     'bg-red-500',
    badge:   'bg-red-500/15 text-red-400 border-red-500/30',
  },
}

// ─── Timeline block action map ────────────────────────────────────────────────

const BLOCK_CMD = {
  NORMAL:     { action: 'CLEAR', color: 'text-green-400', border: 'border-green-500/20', bg: 'bg-green-500/5'  },
  ACCELERATE: { action: 'PUSH',  color: 'text-amber-300', border: 'border-amber-400/20', bg: 'bg-amber-400/5'  },
  HIGH_RISK:  { action: 'HOLD',  color: 'text-red-400',   border: 'border-red-500/20',   bg: 'bg-red-500/5'    },
  RESUME:     { action: 'CLEAR', color: 'text-blue-400',  border: 'border-blue-500/20',  bg: 'bg-blue-500/5'   },
}

// Maps raw risk reason → 2-word dispatcher phrase, no numbers
function toBlockReason(block) {
  switch (block.risk) {
    case 'NORMAL':     return 'Clear window'
    case 'ACCELERATE': return 'Dispatch now'
    case 'RESUME':     return 'Post-storm'
    case 'HIGH_RISK': {
      const r = block.reason.toLowerCase()
      if (r.includes('rain'))  return 'Rain peak'
      if (r.includes('wind'))  return 'Wind risk'
      if (r.includes('vis'))   return 'Low visibility'
      return 'High risk'
    }
    default: return 'Normal'
  }
}

// ─── Briefing sentence generator ─────────────────────────────────────────────
// Produces one dispatcher-focused sentence from safety + hourly signal.
// No weather numbers — pure operational instruction.

function generateCommandBriefing(safety, hourlyBlocks) {
  if (!safety) return null

  const firstRisky     = hourlyBlocks.find(b => b.risk === 'HIGH_RISK')
  const firstAccel     = hourlyBlocks.find(b => b.risk === 'ACCELERATE')
  const firstClear     = hourlyBlocks.find(b => b.risk === 'NORMAL' || b.risk === 'RESUME')

  if (safety.status === 'GREEN') {
    if (firstRisky)
      return `Conditions deteriorate at ${formatHour(firstRisky.time)}. Front-load all orders before then.`
    if (firstAccel)
      return `Push hard now — window closes at ${formatHour(firstAccel.time)}.`
    return 'Full dispatch authorized. No disruptions forecast.'
  }

  if (safety.status === 'AMBER') {
    if (firstClear)
      return `Marginal conditions. Best window opens at ${formatHour(firstClear.time)} — stage riders now.`
    if (firstRisky)
      return `Caution active. Avoid heavy dispatch after ${formatHour(firstRisky.time)}.`
    return 'Reduced capacity. Prioritize highest-value orders only.'
  }

  if (safety.status === 'RED') {
    if (firstClear)
      return `Hold all dispatch. Conditions clear at ${formatHour(firstClear.time)} — stage full fleet now.`
    return 'Critical conditions. Hold all non-essential dispatches until further notice.'
  }

  return null
}

// ─── Operations summary for simulator ────────────────────────────────────────

function generateOpsSummary(result) {
  if (result.projectedDelayRisk === 'LOW')
    return 'Today is a strong operations day. Maximize dispatch volume and hit your targets.'
  if (result.projectedDelayRisk === 'MEDIUM')
    return 'Today is a moderate operations day. Push morning hard. Buffer afternoon capacity.'
  return `High-risk day. Run lean at ${result.recommendedRiders} riders. Communicate delays proactively.`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHour(timeStr) {
  if (!timeStr || String(timeStr).startsWith('Hour')) return timeStr
  try {
    const normalized = /^\d{1,2}:\d{2}$/.test(timeStr)
      ? `2000-01-01T${timeStr}:00`
      : timeStr
    const d = new Date(normalized)
    if (!isNaN(d)) return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
  } catch { /* fall through */ }
  return timeStr
}

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded-lg bg-gray-800/80 ${className}`} />
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold tracking-widest text-gray-600 uppercase mb-4">
      {children}
    </p>
  )
}

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

// ─── Section 1 · Command Hero ─────────────────────────────────────────────────

function CommandHero({ geoData, loading, user, prefs, hourlyBlocks }) {
  const now = useClock()

  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  if (loading) {
    return (
      <div>
        <SectionLabel>Command Status</SectionLabel>
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 space-y-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    )
  }

  const location = geoData?.location ?? geoData?.city_info ?? {}
  const current  = geoData?.current ?? geoData?.current_weather ?? {}
  const city     = location.name ?? location.city ?? geoData?.city ?? 'Operations Centre'
  const safety   = getRiderSafetyStatus(current)
  const cmd      = CMD[safety.status] ?? CMD.AMBER
  const briefing = generateCommandBriefing(safety, hourlyBlocks)

  return (
    <div>
      <SectionLabel>Command Status</SectionLabel>

      {user && (
        <p className="text-xs text-gray-600 mb-3 font-mono uppercase tracking-widest">
          {prefs?.fleetName ?? user.displayName}
        </p>
      )}

      <div className={`rounded-2xl border ${cmd.border} ${cmd.bg} p-8 shadow-2xl ${cmd.glow} space-y-6`}>

        {/* City + clock */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">{dateStr}</p>
            <p className="text-lg font-semibold text-white mt-1">{city}</p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-mono font-bold tabular-nums ${cmd.color}`}>{timeStr}</p>
            <p className="text-xs text-gray-600 font-mono mt-0.5">LOCAL TIME</p>
          </div>
        </div>

        {/* Primary status — biggest element on the page */}
        <div className={`border-t border-b ${cmd.border} py-5`}>
          <div className="flex items-center gap-3">
            <span className={`inline-block w-3 h-3 rounded-full shrink-0 animate-pulse ${cmd.dot}`} />
            <span className={`text-3xl sm:text-4xl font-black tracking-tight ${cmd.color}`}>
              {cmd.label}
            </span>
          </div>
        </div>

        {/* One-sentence operational briefing — no weather numbers */}
        {briefing && (
          <p className="text-gray-300 text-base leading-relaxed">
            {briefing}
          </p>
        )}

      </div>
    </div>
  )
}

// ─── Section 2 · Dispatch Timeline ───────────────────────────────────────────

function DispatchTimeline({ blocks, loading }) {
  return (
    <div>
      <SectionLabel>Hourly Dispatch Signal</SectionLabel>

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 w-28 h-40 bg-gray-900 rounded-xl border border-gray-800 animate-pulse" />
          ))}
        </div>
      ) : blocks.length === 0 ? (
        <p className="text-gray-600 text-sm">No hourly signal available.</p>
      ) : (
        <div
          className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4"
          style={{ scrollbarWidth: 'none' }}
        >
          {blocks.map((block, i) => {
            const s = BLOCK_CMD[block.risk] ?? BLOCK_CMD.NORMAL
            return (
              <div
                key={i}
                className={`shrink-0 w-28 rounded-xl border ${s.border} ${s.bg} overflow-hidden flex flex-col`}
              >
                {/* Colour strip */}
                <div className={`h-1 w-full ${
                  block.risk === 'NORMAL'     ? 'bg-green-500' :
                  block.risk === 'ACCELERATE' ? 'bg-amber-400' :
                  block.risk === 'HIGH_RISK'  ? 'bg-red-500'   :
                  'bg-blue-500'
                }`} />

                <div className="flex flex-col flex-1 p-3 gap-3">
                  {/* Hour */}
                  <p className="text-gray-400 text-xs font-mono tabular-nums">
                    {formatHour(block.time)}
                  </p>

                  {/* Action word — dominant */}
                  <p className={`text-xl font-black tracking-tight leading-none ${s.color}`}>
                    {s.action}
                  </p>

                  {/* Short reason — no numbers */}
                  <p className="text-gray-500 text-xs leading-snug mt-auto">
                    {toBlockReason(block)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Section 3 · Impact Simulator ────────────────────────────────────────────

function HowWeCalculate() {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-gray-800 pt-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-400 transition-colors select-none"
      >
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        How we calculate this
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-xs text-gray-500 leading-relaxed">
          <p>Each HOLD hour cuts effective rider capacity by <span className="text-gray-400">15%</span>. Baseline is 3 orders per rider per hour.</p>
          <p>On-time rate starts at <span className="text-gray-400">95%</span> and drops 10 points per HOLD hour, flooring at 40% in severe conditions.</p>
          <p>Best dispatch window is the first safe 2-hour stretch — the optimal window to front-load volume.</p>
        </div>
      )}
    </div>
  )
}

function ImpactSimulator({ hourlyData, savedRiders, savedOrders }) {
  const [riders, setRiders] = useState('')
  const [orders, setOrders] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => { if (savedRiders != null) setRiders(String(savedRiders)) }, [savedRiders])
  useEffect(() => { if (savedOrders != null) setOrders(String(savedOrders)) }, [savedOrders])

  const canCalculate = riders !== '' && orders !== '' && Number(riders) > 0 && Number(orders) > 0

  const calculate = () => {
    if (!canCalculate) return
    setResult(getImpactEstimate(Number(riders), Number(orders), hourlyData))
  }

  const DELAY_STYLES = {
    LOW:    { text: 'text-green-400', border: 'border-green-500/25', bg: 'bg-green-500/5'  },
    MEDIUM: { text: 'text-amber-400', border: 'border-amber-400/25', bg: 'bg-amber-400/5'  },
    HIGH:   { text: 'text-red-400',   border: 'border-red-500/25',   bg: 'bg-red-500/5'    },
  }

  const inputClass = `
    w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm font-mono
    focus:outline-none focus:border-gray-500 transition-colors placeholder:text-gray-700
    [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none
    [&::-webkit-outer-spin-button]:appearance-none
  `.trim()

  return (
    <div>
      <SectionLabel>Impact Simulator</SectionLabel>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="block text-xs text-gray-500 font-mono uppercase tracking-wider">Active Riders</span>
            <input type="number" min="1" value={riders}
              onChange={e => setRiders(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && calculate()}
              placeholder="e.g. 24" className={inputClass} />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs text-gray-500 font-mono uppercase tracking-wider">Expected Orders</span>
            <input type="number" min="1" value={orders}
              onChange={e => setOrders(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && calculate()}
              placeholder="e.g. 80" className={inputClass} />
          </label>
        </div>

        <button onClick={calculate} disabled={!canCalculate}
          className="w-full py-2.5 bg-white text-gray-900 font-bold rounded-lg text-sm tracking-wide
                     hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          Run Simulation
        </button>

        {result && (() => {
          const delayStyle = DELAY_STYLES[result.projectedDelayRisk] ?? DELAY_STYLES.MEDIUM
          const delayedPct = 100 - result.estimatedOnTimeRate

          return (
            <div className="space-y-3 border-t border-gray-800 pt-5">

              {/* Primary action */}
              <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
                <p className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Recommendation</p>
                <p className="text-2xl font-black text-white">
                  Send {result.recommendedRiders} riders out now
                </p>
              </div>

              {/* Delay expectation */}
              <div className={`rounded-xl p-4 border ${delayStyle.border} ${delayStyle.bg}`}>
                <p className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Order Risk</p>
                <p className={`text-lg font-bold ${delayStyle.text}`}>
                  Expect {delayedPct}% of orders delayed
                </p>
              </div>

              {/* Best window */}
              <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
                <p className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Best Window</p>
                <p className="text-lg font-bold text-white">{result.bestDispatchWindow}</p>
              </div>

              {/* Bottom line */}
              <div className="rounded-xl p-4 border border-gray-700/50 bg-gray-800/30">
                <p className="text-sm text-gray-400 leading-relaxed">
                  {generateOpsSummary(result)}
                </p>
              </div>

              <HowWeCalculate />
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ─── Raw Data (collapsed) ─────────────────────────────────────────────────────

function RawData({ geoData, hourlyData }) {
  const [open, setOpen] = useState(false)
  if (!geoData && !hourlyData.length) return null

  return (
    <div className="border-t border-gray-900 pt-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs text-gray-700 hover:text-gray-500 transition-colors select-none"
      >
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        <span className="font-mono uppercase tracking-widest">Raw API Data</span>
      </button>
      {open && (
        <pre className="mt-3 text-xs text-gray-600 bg-gray-900 rounded-xl p-4 overflow-x-auto border border-gray-800 font-mono leading-relaxed">
          {JSON.stringify({ geo: geoData, hourly: hourlyData }, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth()
  const { geoData, city, geoLoading } = useWeather()

  const [hourlyBlocks,  setHourlyBlocks]  = useState([])
  const [hourlyData,    setHourlyData]    = useState([])
  const [hourlyLoading, setHourlyLoading] = useState(true)
  const [prefs,         setPrefs]         = useState(null)
  const hourlyCalledRef = useRef(false)

  useEffect(() => {
    if (!geoData || hourlyCalledRef.current) return
    hourlyCalledRef.current = true

    const loc = geoData.location ?? geoData.city_info ?? {}
    const lat  = loc.lat ?? loc.latitude
    const lon  = loc.lon ?? loc.lng ?? loc.longitude
    if (lat == null || lon == null) { setHourlyLoading(false); return }

    getHourlyForecast(lat, lon).then(result => {
      console.log('[HourlyForecast] raw response:', result)
      const raw = result?.data?.forecast ?? result?.data?.hourly ?? result?.data ?? []
      const arr = Array.isArray(raw) ? raw : []
      setHourlyData(arr)
      setHourlyBlocks(getHourlyRiskBlocks(arr))
      setHourlyLoading(false)
    })
  }, [geoData])

  useEffect(() => {
    if (!user) { setPrefs(null); return }
    getDoc(doc(db, 'users', user.uid, 'preferences', 'fleet'))
      .then(snap => { if (snap.exists()) setPrefs(snap.data()) })
      .catch(() => {})
  }, [user])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4">

        <Navbar city={city} cityLoading={geoLoading || hourlyLoading} />

        <div className="py-8 space-y-10">
          <CommandHero
            geoData={geoData}
            loading={geoLoading || hourlyLoading}
            user={user}
            prefs={prefs}
            hourlyBlocks={hourlyBlocks}
          />

          <DispatchTimeline
            blocks={hourlyBlocks}
            loading={hourlyLoading}
          />

          <ImpactSimulator
            hourlyData={hourlyData}
            savedRiders={prefs?.riderCount}
            savedOrders={prefs?.dailyOrders}
          />

          <RawData geoData={geoData} hourlyData={hourlyData} />
        </div>

      </div>
    </div>
  )
}
