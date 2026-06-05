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

// ─── Color maps ───────────────────────────────────────────────────────────────

const STATUS_HEX = { GREEN: '#22c55e', AMBER: '#f59e0b', RED: '#ef4444' }

const CMD = {
  GREEN: { label: 'CLEAR TO DISPATCH',    color: 'text-green-400', dot: 'bg-green-400' },
  AMBER: { label: 'DISPATCH WITH CAUTION',color: 'text-amber-400', dot: 'bg-amber-400' },
  RED:   { label: 'HOLD DISPATCH',        color: 'text-red-400',   dot: 'bg-red-500'   },
}

const BLOCK_CMD = {
  NORMAL:     { action: 'CLEAR', color: 'text-green-400', borderColor: 'rgba(34,197,94,0.2)',  bgColor: 'rgba(34,197,94,0.04)',  strip: '#22c55e' },
  ACCELERATE: { action: 'PUSH',  color: 'text-amber-300', borderColor: 'rgba(251,191,36,0.2)', bgColor: 'rgba(251,191,36,0.04)', strip: '#f59e0b' },
  HIGH_RISK:  { action: 'HOLD',  color: 'text-red-400',   borderColor: 'rgba(239,68,68,0.2)',  bgColor: 'rgba(239,68,68,0.04)',  strip: '#ef4444' },
  RESUME:     { action: 'CLEAR', color: 'text-blue-400',  borderColor: 'rgba(96,165,250,0.2)', bgColor: 'rgba(96,165,250,0.04)', strip: '#60a5fa' },
}

const DELAY_COLORS = {
  LOW:    { text: 'text-green-400', hex: '#22c55e', label: 'Low delay risk'    },
  MEDIUM: { text: 'text-amber-400', hex: '#f59e0b', label: 'Moderate risk'     },
  HIGH:   { text: 'text-red-400',   hex: '#ef4444', label: 'High delay risk'   },
}

// ─── Logic helpers ────────────────────────────────────────────────────────────

// Derive reason text from actual hourly data values
function deriveReason(hourData) {
  if (!hourData) return 'Clear window'
  const precipProb = hourData.precipitation_probability ?? hourData.precip_probability ?? 0
  const windGust   = hourData.wind_gusts_10m ?? hourData.wind_gust_kph ?? hourData.windgust ?? hourData.gust_kph ?? 0
  const wind       = hourData.wind_kph ?? hourData.wind_speed_10m ?? hourData.wind_speed ?? 0
  const rain       = hourData.precip_mm ?? hourData.precipitation ?? hourData.precip ?? 0
  const vis        = hourData.vis_km ?? hourData.visibility_km ?? 10

  if (precipProb > 60) return 'Heavy rain risk'
  if (precipProb > 40) return 'Rain likely'
  if (precipProb > 20) return 'Shower chance'
  if (windGust  > 50)  return 'Storm gusts'
  if (windGust  > 35)  return 'Strong gusts'
  if (wind      > 40)  return 'High winds'
  if (rain      > 10)  return 'Rain peak'
  if (vis       < 0.5) return 'Low visibility'
  return 'Clear window'
}

// Keep only blocks from the current hour onward
function filterFromNow(blocks, hourlyData) {
  const now = new Date()
  now.setMinutes(0, 0, 0)

  return blocks.reduce((acc, block, i) => {
    try {
      const s = String(block.time ?? '')
      if (s.startsWith('Hour')) { acc.push({ block, hour: hourlyData[i] }); return acc }

      let t
      if (/^\d{1,2}:\d{2}$/.test(s)) {
        const today = new Date().toISOString().split('T')[0]
        t = new Date(`${today}T${s}:00`)
      } else {
        t = new Date(s)
      }

      if (isNaN(t)) { acc.push({ block, hour: hourlyData[i] }); return acc }
      t.setMinutes(0, 0, 0)
      if (t >= now) acc.push({ block, hour: hourlyData[i] })
    } catch {
      acc.push({ block, hour: hourlyData[i] })
    }
    return acc
  }, [])
}

function generateCommandBriefing(safety, hourlyBlocks) {
  if (!safety) return null
  const firstRisky = hourlyBlocks.find(b => b.risk === 'HIGH_RISK')
  const firstAccel = hourlyBlocks.find(b => b.risk === 'ACCELERATE')
  const firstClear = hourlyBlocks.find(b => b.risk === 'NORMAL' || b.risk === 'RESUME')

  if (safety.status === 'GREEN') {
    if (firstRisky) return `Conditions deteriorate at ${formatHour(firstRisky.time)}. Front-load all orders before then.`
    if (firstAccel) return `Push hard now — window closes at ${formatHour(firstAccel.time)}.`
    return 'Full dispatch authorized. No disruptions forecast.'
  }
  if (safety.status === 'AMBER') {
    if (firstClear) return `Marginal conditions. Best window opens at ${formatHour(firstClear.time)} — stage riders now.`
    if (firstRisky) return `Caution active. Avoid heavy dispatch after ${formatHour(firstRisky.time)}.`
    return 'Reduced capacity. Prioritize highest-value orders only.'
  }
  if (safety.status === 'RED') {
    if (firstClear) return `Hold all dispatch. Conditions clear at ${formatHour(firstClear.time)} — stage full fleet now.`
    return 'Critical conditions. Hold all non-essential dispatches until further notice.'
  }
  return null
}

function generateOpsSummary(result) {
  if (result.projectedDelayRisk === 'LOW')    return 'Today is a strong operations day. Maximize dispatch volume.'
  if (result.projectedDelayRisk === 'MEDIUM') return 'Moderate risk day. Push morning hard, buffer afternoon.'
  return `High-risk day. Run lean at ${result.recommendedRiders} riders. Communicate delays proactively.`
}

function formatHour(timeStr) {
  if (!timeStr || String(timeStr).startsWith('Hour')) return timeStr
  try {
    const s = String(timeStr)
    const normalized = /^\d{1,2}:\d{2}$/.test(s) ? `2000-01-01T${s}:00` : s
    const d = new Date(normalized)
    if (!isNaN(d)) return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
  } catch { /* fall through */ }
  return timeStr
}

// ─── Shared style ─────────────────────────────────────────────────────────────

const GLASS = {
  background: 'rgba(10,16,34,0.85)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderRadius: '1rem',
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded-xl ${className}`} style={{ background: 'rgba(255,255,255,0.06)' }} />
}

function SectionLabel({ children }) {
  return <p className="text-xs font-semibold tracking-widest text-gray-500 uppercase mb-5">{children}</p>
}

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

// ─── Section 1 · Command Status ───────────────────────────────────────────────

function CommandHero({ geoData, city, loading, user, prefs, hourlyBlocks, rateLimitRemaining }) {
  const now = useClock()
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  if (loading) {
    return (
      <div>
        <SectionLabel>Command Status</SectionLabel>
        <div style={{ ...GLASS, padding: '2rem', border: '1px solid rgba(255,255,255,0.07)' }} className="space-y-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-14 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    )
  }

  const current  = geoData?.current ?? geoData?.current_weather ?? {}
  const safety   = getRiderSafetyStatus(current)
  const cmd      = CMD[safety.status] ?? CMD.AMBER
  const hex      = STATUS_HEX[safety.status] ?? STATUS_HEX.AMBER
  const briefing = generateCommandBriefing(safety, hourlyBlocks)
  const displayCity = city ?? 'Detected Location'

  return (
    <div>
      <SectionLabel>Command Status</SectionLabel>

      {user && (
        <p className="text-xs text-gray-600 mb-3 font-mono uppercase tracking-widest">
          {prefs?.fleetName ?? user.displayName}
        </p>
      )}

      <div
        style={{
          ...GLASS,
          borderTop:    `1px solid ${hex}28`,
          borderRight:  `1px solid ${hex}28`,
          borderBottom: `1px solid ${hex}28`,
          borderLeft:   `3px solid ${hex}`,
          boxShadow:    `0 0 60px ${hex}18, 0 8px 40px rgba(0,0,0,0.5)`,
          padding: '2rem',
        }}
      >
        {/* Date + clock */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs font-mono text-gray-600 uppercase tracking-widest">{dateStr}</p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-mono font-bold tabular-nums ${cmd.color}`}>{timeStr}</p>
            <p className="text-xs text-gray-600 font-mono mt-0.5">LOCAL TIME</p>
          </div>
        </div>

        {/* Primary status */}
        <div className="py-5 mb-6" style={{ borderTop: `1px solid ${hex}20`, borderBottom: `1px solid ${hex}20` }}>
          <div className="flex items-center gap-3">
            <span className={`inline-block w-3 h-3 rounded-full shrink-0 animate-pulse ${cmd.dot}`} />
            <span className={`text-4xl sm:text-5xl font-black tracking-tight leading-none ${cmd.color}`}>
              {cmd.label}
            </span>
          </div>
        </div>

        {/* Briefing */}
        {briefing && (
          <p className="text-gray-300 text-base leading-relaxed mb-6">{briefing}</p>
        )}

        {/* Footer row */}
        <div
          className="flex items-center justify-between pt-4"
          style={{ borderTop: `1px solid rgba(255,255,255,0.07)` }}
        >
          <span className="text-xs text-gray-500">{displayCity}</span>
          {rateLimitRemaining != null && (
            <span
              className="text-xs font-mono px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)' }}
            >
              API: {rateLimitRemaining} calls remaining
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Section 2 · Dispatch Timeline ───────────────────────────────────────────

function DispatchTimeline({ blocks, hourlyData, loading }) {
  const visiblePairs = filterFromNow(blocks, hourlyData)

  return (
    <div>
      <SectionLabel>Hourly Dispatch Signal</SectionLabel>

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 w-28 h-40 rounded-xl animate-pulse"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }} />
          ))}
        </div>
      ) : visiblePairs.length === 0 ? (
        <p className="text-gray-600 text-sm">No upcoming signal available.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
          {visiblePairs.map(({ block, hour }, i) => {
            const s      = BLOCK_CMD[block.risk] ?? BLOCK_CMD.NORMAL
            const reason = deriveReason(hour)
            return (
              <div key={i} className="shrink-0 w-28 rounded-xl overflow-hidden flex flex-col"
                style={{ border: `1px solid ${s.borderColor}`, background: s.bgColor }}>
                <div className="h-1 w-full" style={{ background: s.strip }} />
                <div className="flex flex-col flex-1 p-3 gap-3">
                  <p className="text-gray-400 text-xs font-mono tabular-nums">{formatHour(block.time)}</p>
                  <p className={`text-xl font-black tracking-tight leading-none ${s.color}`}>{s.action}</p>
                  <p className="text-gray-500 text-xs leading-snug mt-auto">{reason}</p>
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

function ResultGrid({ result }) {
  const dc = DELAY_COLORS[result.projectedDelayRisk] ?? DELAY_COLORS.MEDIUM

  const formatWindow = (raw) => {
    if (!raw || raw === 'Now') return raw
    return raw.split(' – ').map(formatHour).join(' – ')
  }

  const cards = [
    { label: 'Riders needed', value: `Send ${result.recommendedRiders}`          },
    { label: 'Best window',   value: formatWindow(result.bestDispatchWindow)      },
    { label: 'On-time rate',  value: `${result.estimatedOnTimeRate}%`             },
    { label: 'Delay risk',    value: dc.label, colorClass: dc.text                },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c, i) => (
          <div
            key={i}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.75rem', padding: '1rem' }}
          >
            <p className="text-xs text-gray-600 uppercase tracking-wide mb-2">{c.label}</p>
            <p className={`text-base font-bold ${c.colorClass ?? 'text-white'}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0.75rem', padding: '1rem' }}>
        <p className="text-sm text-gray-400 leading-relaxed">{generateOpsSummary(result)}</p>
      </div>

      <HowWeCalculate />
    </div>
  )
}

function HowWeCalculate() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1rem' }}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-400 transition-colors select-none">
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

  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.5rem',
    padding: '0.625rem 0.75rem',
    color: 'white',
    fontSize: '0.875rem',
    fontFamily: 'monospace',
    outline: 'none',
  }

  return (
    <div>
      <SectionLabel>Impact Simulator</SectionLabel>
      <div style={{ ...GLASS, border: '1px solid rgba(255,255,255,0.07)', padding: '1.5rem' }} className="space-y-5">

        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="block text-xs text-gray-500 font-mono uppercase tracking-wider">Active Riders</span>
            <input type="number" min="1" value={riders}
              onChange={e => setRiders(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && calculate()}
              placeholder="e.g. 24" style={inputStyle}
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs text-gray-500 font-mono uppercase tracking-wider">Expected Orders</span>
            <input type="number" min="1" value={orders}
              onChange={e => setOrders(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && calculate()}
              placeholder="e.g. 80" style={inputStyle}
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
          </label>
        </div>

        <button
          onClick={calculate}
          disabled={!canCalculate}
          className="w-full py-2.5 font-bold rounded-lg text-sm tracking-wide transition-all"
          style={canCalculate
            ? { background: '#22c55e', color: '#fff' }
            : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)', cursor: 'not-allowed' }
          }
        >
          Run Simulation
        </button>

        {result && <ResultGrid result={result} />}
      </div>
    </div>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer
      className="text-center py-8"
      style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
    >
      <p className="text-xs text-gray-700 tracking-wide">
        Powered by WeatherAI API · Built for East African Fleet Operators
      </p>
    </footer>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth()
  const { geoData, city, geoLoading, rateLimitRemaining } = useWeather()

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
    <div className="min-h-screen text-white" style={{ background: '#05080f' }}>
      <div className="max-w-2xl mx-auto px-4">
        <Navbar city={city} cityLoading={geoLoading || hourlyLoading} />

        <div className="py-10 space-y-14">
          <CommandHero
            geoData={geoData}
            city={city}
            loading={geoLoading || hourlyLoading}
            user={user}
            prefs={prefs}
            hourlyBlocks={hourlyBlocks}
            rateLimitRemaining={rateLimitRemaining}
          />

          <DispatchTimeline
            blocks={hourlyBlocks}
            hourlyData={hourlyData}
            loading={hourlyLoading}
          />

          <ImpactSimulator
            hourlyData={hourlyData}
            savedRiders={prefs?.riderCount}
            savedOrders={prefs?.dailyOrders}
          />
        </div>

        <Footer />
      </div>
    </div>
  )
}
