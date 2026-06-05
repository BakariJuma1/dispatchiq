import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../context/AuthContext'
import { getWeatherByGeo, getHourlyForecast } from '../services/weatherService'
import {
  getRiderSafetyStatus,
  getHourlyRiskBlocks,
  getImpactEstimate,
  formatAIBriefing,
} from '../utils/dispatchLogic'

// ─── Style maps ───────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  GREEN: 'bg-green-500 text-white',
  AMBER: 'bg-amber-400 text-black',
  RED:   'bg-red-600 text-white',
}

const STATUS_GLOW = {
  GREEN: 'shadow-green-500/20',
  AMBER: 'shadow-amber-400/20',
  RED:   'shadow-red-600/20',
}

const BLOCK = {
  NORMAL:     { bar: 'bg-green-500', badge: 'bg-green-500/10 text-green-400', border: 'border-green-500/25', dot: 'bg-green-500' },
  ACCELERATE: { bar: 'bg-amber-400', badge: 'bg-amber-400/10 text-amber-300', border: 'border-amber-400/25', dot: 'bg-amber-400' },
  HIGH_RISK:  { bar: 'bg-red-500',   badge: 'bg-red-500/10   text-red-400',   border: 'border-red-500/25',   dot: 'bg-red-500'   },
  RESUME:     { bar: 'bg-blue-500',  badge: 'bg-blue-500/10  text-blue-400',  border: 'border-blue-500/25',  dot: 'bg-blue-500'  },
}

const DELAY_COLOR = {
  LOW:    'text-green-400',
  MEDIUM: 'text-amber-400',
  HIGH:   'text-red-400',
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded-lg bg-gray-800 ${className}`} />
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold tracking-widest text-gray-600 uppercase mb-4">
      {children}
    </p>
  )
}

function greeting(name) {
  const h = new Date().getHours()
  const period = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  return `Good ${period}${name ? `, ${name}` : ''}`
}

// ─── Section 1 · Ops Brief ────────────────────────────────────────────────────

function OpsBrief({ geoData, loading, user, prefs }) {
  if (loading) {
    return (
      <div>
        <SectionLabel>Ops Brief</SectionLabel>
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    )
  }

  const location = geoData?.location ?? {}
  const current  = geoData?.current  ?? {}
  const city     = location.name ?? location.city ?? 'Unknown Location'
  const safety   = getRiderSafetyStatus(current)
  const briefing = formatAIBriefing(geoData?.ai_summary ?? geoData?.briefing ?? safety.reason)
  const badge    = STATUS_BADGE[safety.status] ?? STATUS_BADGE.AMBER
  const glow     = STATUS_GLOW[safety.status]  ?? ''

  return (
    <div>
      <SectionLabel>Ops Brief</SectionLabel>

      {user && (
        <p className="text-sm text-gray-400 mb-3">
          {greeting(user.displayName?.split(' ')[0])}
          {prefs?.fleetName && (
            <span className="text-gray-600"> · {prefs.fleetName}</span>
          )}
        </p>
      )}

      <div className={`bg-gray-900 rounded-2xl border border-gray-800 p-6 shadow-xl ${glow}`}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white leading-tight">{city}</h2>
            <p className="text-gray-500 text-xs mt-1">Live conditions · auto-detected</p>
          </div>
          <span className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold tracking-wider shadow-lg ${badge}`}>
            {safety.status}
          </span>
        </div>
        <div className="border-t border-gray-800 pt-4">
          <p className="text-gray-300 text-sm leading-relaxed">{briefing}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Section 2 · Dispatch Timeline ───────────────────────────────────────────

function DispatchTimeline({ blocks, loading }) {
  return (
    <div>
      <SectionLabel>Dispatch Timeline</SectionLabel>

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shrink-0 w-36 h-32 bg-gray-900 rounded-xl border border-gray-800 animate-pulse" />
          ))}
        </div>
      ) : blocks.length === 0 ? (
        <p className="text-gray-600 text-sm">Hourly forecast unavailable.</p>
      ) : (
        <div
          className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4"
          style={{ scrollbarWidth: 'none' }}
        >
          {blocks.map((block, i) => {
            const s = BLOCK[block.risk] ?? BLOCK.NORMAL
            return (
              <div
                key={i}
                className={`shrink-0 w-36 rounded-xl border bg-gray-900 overflow-hidden ${s.border}`}
              >
                {/* Colour bar at top — the most immediate visual signal */}
                <div className={`h-1.5 w-full ${s.bar}`} />

                <div className="p-3.5 space-y-2.5">
                  <p className="text-gray-400 text-xs font-medium tabular-nums">{block.time}</p>

                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${s.badge} ${s.border}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                    {block.label}
                  </span>

                  <p className="text-gray-500 text-xs leading-relaxed line-clamp-3">
                    {block.reason}
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

function ImpactSimulator({ hourlyData, savedRiders, savedOrders }) {
  const [riders,  setRiders]  = useState('')
  const [orders,  setOrders]  = useState('')
  const [result,  setResult]  = useState(null)

  // Pre-fill from Firestore prefs when they arrive
  useEffect(() => { if (savedRiders != null) setRiders(String(savedRiders)) }, [savedRiders])
  useEffect(() => { if (savedOrders != null) setOrders(String(savedOrders)) }, [savedOrders])

  const canCalculate = riders !== '' && orders !== '' && Number(riders) > 0 && Number(orders) > 0

  const calculate = () => {
    if (!canCalculate) return
    setResult(getImpactEstimate(Number(riders), Number(orders), hourlyData))
  }

  return (
    <div>
      <SectionLabel>Impact Simulator</SectionLabel>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5">
        {/* Inputs */}
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="block text-xs text-gray-500 font-medium">Active Riders</span>
            <input
              type="number"
              min="1"
              value={riders}
              onChange={e => setRiders(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && calculate()}
              placeholder="e.g. 24"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm
                         focus:outline-none focus:border-gray-500 placeholder:text-gray-700
                         [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs text-gray-500 font-medium">Expected Orders</span>
            <input
              type="number"
              min="1"
              value={orders}
              onChange={e => setOrders(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && calculate()}
              placeholder="e.g. 80"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm
                         focus:outline-none focus:border-gray-500 placeholder:text-gray-700
                         [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </label>
        </div>

        <button
          onClick={calculate}
          disabled={!canCalculate}
          className="w-full py-2.5 bg-white text-gray-900 font-semibold rounded-lg text-sm
                     hover:bg-gray-100 transition-colors
                     disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Calculate Impact
        </button>

        {/* Results */}
        {result && (
          <div className="border-t border-gray-800 pt-5 grid grid-cols-2 gap-3">
            <ResultTile label="Recommended Riders" value={result.recommendedRiders} />
            <ResultTile
              label="Delay Risk"
              value={result.projectedDelayRisk}
              valueClass={DELAY_COLOR[result.projectedDelayRisk] ?? 'text-white'}
            />
            <ResultTile label="Best Dispatch Window" value={result.bestDispatchWindow} small />
            <ResultTile label="Est. On-Time Rate"    value={`${result.estimatedOnTimeRate}%`} />
          </div>
        )}
      </div>
    </div>
  )
}

function ResultTile({ label, value, valueClass = 'text-white', small = false }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-3.5 space-y-1 border border-gray-800">
      <p className="text-xs text-gray-600">{label}</p>
      <p className={`font-bold leading-tight ${small ? 'text-base' : 'text-xl'} ${valueClass}`}>
        {value}
      </p>
    </div>
  )
}

// ─── Dashboard (data orchestrator) ───────────────────────────────────────────

export default function Dashboard() {
  const { user, signOut } = useAuth()

  const [geoData,       setGeoData]       = useState(null)
  const [geoLoading,    setGeoLoading]    = useState(true)
  const [hourlyBlocks,  setHourlyBlocks]  = useState([])
  const [hourlyData,    setHourlyData]    = useState([])
  const [hourlyLoading, setHourlyLoading] = useState(true)
  const [prefs,         setPrefs]         = useState(null)

  // Geo + current conditions — fires immediately, no user action needed
  useEffect(() => {
    getWeatherByGeo().then(result => {
      setGeoData(result?.data ?? null)
      setGeoLoading(false)
    })
  }, [])

  // Hourly forecast — runs once we have lat/lon from the geo response
  useEffect(() => {
    if (!geoData) return
    const loc = geoData.location ?? {}
    const lat = loc.lat ?? loc.latitude
    const lon = loc.lon ?? loc.lng ?? loc.longitude

    if (lat == null || lon == null) { setHourlyLoading(false); return }

    getHourlyForecast(lat, lon).then(result => {
      const raw = result?.data?.forecast ?? result?.data?.hourly ?? result?.data ?? []
      const arr = Array.isArray(raw) ? raw : []
      setHourlyData(arr)
      setHourlyBlocks(getHourlyRiskBlocks(arr))
      setHourlyLoading(false)
    })
  }, [geoData])

  // Firestore prefs — only for signed-in users
  useEffect(() => {
    if (!user) { setPrefs(null); return }
    getDoc(doc(db, 'users', user.uid))
      .then(snap => { if (snap.exists()) setPrefs(snap.data()) })
      .catch(() => {})
  }, [user])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">

        {/* Nav */}
        <header className="flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight">DispatchIQ</span>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {user.photoURL && (
                  <img
                    src={user.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full ring-1 ring-gray-700"
                  />
                )}
                <button
                  onClick={signOut}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Sign out
                </button>
              </>
            ) : (
              <span className="text-xs text-gray-600 bg-gray-900 border border-gray-800 px-3 py-1 rounded-full">
                Guest
              </span>
            )}
          </div>
        </header>

        <OpsBrief
          geoData={geoData}
          loading={geoLoading}
          user={user}
          prefs={prefs}
        />

        <DispatchTimeline
          blocks={hourlyBlocks}
          loading={hourlyLoading}
        />

        <ImpactSimulator
          hourlyData={hourlyData}
          savedRiders={prefs?.riderCount}
          savedOrders={prefs?.orderCount}
        />

      </div>
    </div>
  )
}
