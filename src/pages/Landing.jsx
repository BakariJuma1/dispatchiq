import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getRiderSafetyStatus } from '../utils/dispatchLogic'
import { useAuth } from '../context/AuthContext'
import { useWeather } from '../context/WeatherContext'
import Navbar from '../components/Navbar'

const STATUS_COLOR = {
  GREEN: '#22c55e',
  AMBER: '#f59e0b',
  RED:   '#ef4444',
}

const NAIROBI = [-1.2921, 36.8219]

function makePin(color) {
  return L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="44" viewBox="0 0 30 44"
                style="animation:pin-drop 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards;
                       filter:drop-shadow(0 0 10px ${color}aa)">
             <path d="M15 0C6.716 0 0 6.716 0 15c0 11.25 15 29 15 29S30 26.25 30 15C30 6.716 23.284 0 15 0z"
                   fill="${color}" fill-opacity="0.88"/>
             <circle cx="15" cy="15" r="6" fill="white" fill-opacity="0.95"/>
           </svg>`,
    iconSize:   [30, 44],
    iconAnchor: [15, 44],
  })
}

function MapController({ lat, lon }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo([lat, lon], 14, { duration: 1.8, easeLinearity: 0.2 })
  }, [lat, lon, map])
  return null
}

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function Landing() {
  const { googleSignIn } = useAuth()
  const { geoData, city, geoLoading } = useWeather()
  const navigate = useNavigate()
  const now = useClock()

  const lat = geoData?.location?.lat ?? NAIROBI[0]
  const lon = geoData?.location?.lon ?? NAIROBI[1]

  const current  = geoData?.current ?? geoData?.current_weather ?? geoData?.weather ?? {}
  const safety   = getRiderSafetyStatus(geoData ? current : null)
  const briefing = geoData?.ai_summary ?? geoData?.briefing ?? geoData?.summary ?? null

  const color = STATUS_COLOR[safety.status] ?? STATUS_COLOR.AMBER

  const temp      = current.temp_c ?? current.temperature ?? current.temperature_2m ?? null
  const condition = current.condition?.text ?? current.description ?? current.weather_description ?? null
  const wind      = current.wind_kph ?? current.wind_speed ?? current.wind_speed_10m ?? null

  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  const handleGoogleSignIn = async () => {
    try { await googleSignIn() } catch {}
  }

  return (
    <div style={{ background: '#05080f' }} className="text-white">

      {/* ════════════════════════════════════════
          HERO — full viewport, map background
          ════════════════════════════════════════ */}
      <section className="relative h-screen flex flex-col overflow-hidden">

        {/* Map */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <MapContainer
            center={NAIROBI}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            scrollWheelZoom={false}
            dragging={false}
            doubleClickZoom={false}
            touchZoom={false}
            keyboard={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            {!geoLoading && (
              <>
                <Marker
                  key={`${lat},${lon},${safety.status}`}
                  position={[lat, lon]}
                  icon={makePin(color)}
                />
                <MapController lat={lat} lon={lon} />
              </>
            )}
          </MapContainer>
        </div>

        {/* Gradient overlay */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background:
              'linear-gradient(to bottom, rgba(4,7,18,0.75) 0%, rgba(4,7,18,0.05) 38%, rgba(4,7,18,0.05) 58%, rgba(4,7,18,0.82) 100%)',
          }}
        />

        {/* Navbar */}
        <div className="relative z-20 max-w-3xl w-full mx-auto px-4">
          <Navbar city={city} cityLoading={geoLoading} />
        </div>

        {/* Content */}
        <div className="relative z-20 flex-1 flex flex-col items-center justify-center px-4 -mt-6">
          <h1 className="text-4xl md:text-5xl font-bold text-white text-center tracking-tight leading-tight mb-2">
            Know before you dispatch.
          </h1>
          <p className="text-gray-400 text-sm md:text-base text-center mb-7 max-w-xs leading-relaxed">
            Real-time weather intelligence for East African fleet operators.
          </p>

          {/* Status card */}
          <div className="w-full max-w-sm mb-5">
            {geoLoading ? (
              <div
                className="rounded-2xl p-5 animate-pulse"
                style={{
                  background: 'rgba(10,16,34,0.82)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1.5px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex justify-between mb-5">
                  <div className="h-3 w-28 bg-white/10 rounded" />
                  <div className="h-3 w-16 bg-white/10 rounded" />
                </div>
                <div className="h-16 w-36 bg-white/10 rounded-lg mx-auto mb-3" />
                <div className="h-4 w-full bg-white/10 rounded mb-1" />
                <div className="h-4 w-3/4 bg-white/10 rounded mx-auto mb-5" />
                <div className="flex gap-2">
                  <div className="h-7 flex-1 bg-white/10 rounded-full" />
                  <div className="h-7 flex-1 bg-white/10 rounded-full" />
                  <div className="h-7 flex-1 bg-white/10 rounded-full" />
                </div>
              </div>
            ) : (
              <div
                className="rounded-2xl p-5"
                style={{
                  background: 'rgba(10,16,34,0.80)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  border: `1.5px solid ${color}38`,
                  boxShadow: `0 0 48px ${color}1e, 0 8px 40px rgba(0,0,0,0.55)`,
                }}
              >
                <div className="flex justify-between items-center mb-4 text-xs text-gray-500">
                  <span>{dateStr}</span>
                  <span className="font-mono tabular-nums">{timeStr}</span>
                </div>
                <div
                  className="text-center font-black tracking-widest uppercase select-none mb-2"
                  style={{ fontSize: '68px', lineHeight: 1, color }}
                >
                  {safety.status}
                </div>
                <p className="text-white/75 text-center text-sm leading-relaxed mb-4 px-1">
                  {briefing ?? safety.reason}
                </p>
                <div className="flex gap-2">
                  <StatPill value={temp      != null ? `${Math.round(temp)}°C`         : '—°C'}    />
                  <StatPill value={condition                                             ?? 'Clear'} />
                  <StatPill value={wind      != null ? `Wind ${Math.round(wind)} km/h` : 'Wind —'} />
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="w-full max-w-sm space-y-2.5">
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-semibold py-3 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors"
            >
              <GoogleIcon />
              Sign in with Google
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-3 rounded-xl text-white/75 text-sm hover:text-white hover:bg-white/5 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.15)' }}
            >
              Continue as Guest
            </button>
            <p className="text-center text-xs text-gray-600 pt-0.5">
              Signed in users get personalized fleet recommendations
            </p>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="relative z-20 flex flex-col items-center pb-5 gap-1">
          <span className="text-xs text-gray-600 tracking-widest uppercase">Scroll</span>
          <svg className="text-gray-600 animate-bounce" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        </div>
      </section>

      {/* ════════════════════════════════════════
          WHY SECTION
          ════════════════════════════════════════ */}
      <section className="py-24 px-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-4xl mx-auto">
          <p className="text-xs text-gray-600 tracking-widest uppercase mb-3">Why DispatchIQ</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 leading-tight">
            Built for operators.<br />Not weather apps.
          </h2>
          <p className="text-gray-500 mb-14 max-w-lg text-sm leading-relaxed">
            Most weather tools give you data and leave the judgment to you. DispatchIQ makes the
            call — so your dispatcher can focus on moving orders, not reading forecasts.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <WhyCard
              number="01"
              title="Signals, not raw data"
              body="Wind speed and precipitation are automatically converted into a single dispatch verdict — GREEN, AMBER, or RED — with no interpretation needed."
            />
            <WhyCard
              number="02"
              title="Tuned for East Africa"
              body="Risk thresholds are calibrated for two-wheeler riders on East African roads — not European highway drivers. Nairobi weather is not London weather."
            />
            <WhyCard
              number="03"
              title="AI that speaks ops"
              body="Every session opens with a plain-English briefing written for a busy dispatcher: what the conditions are, what changed, and what to do about it."
            />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          HOW IT WORKS
          ════════════════════════════════════════ */}
      <section className="py-24 px-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
        <div className="max-w-4xl mx-auto">
          <p className="text-xs text-gray-600 tracking-widest uppercase mb-3">How it works</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-14 leading-tight">
            Three steps.<br />Zero setup.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            <StepCard
              step="01"
              title="We detect your city"
              body="Your location is read from your IP — no permissions required, no form to fill. Open DispatchIQ and your city is already there."
              connector
            />
            <StepCard
              step="02"
              title="Weather is analyzed"
              body="Current conditions, hourly forecast, wind, rain, and visibility are all weighed against rider-safety thresholds built into the model."
              connector
            />
            <StepCard
              step="03"
              title="You dispatch with confidence"
              body="A single signal tells you whether to go, go with caution, or hold. Backed by an AI briefing and an hourly risk timeline for deeper dives."
            />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          FAQ — wind scene fills the background
          ════════════════════════════════════════ */}
      <section
        className="py-24 px-4 relative overflow-hidden"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        {/* White silhouette wind scene — absolute background */}
        <WindScene windKph={wind} />

        {/* FAQ content — frosted glass panel so text reads over trees */}
        <div
          className="max-w-2xl mx-auto relative z-10 rounded-2xl px-8 py-10"
          style={{
            background: 'rgba(5,8,15,0.6)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          <p className="text-xs text-gray-400 tracking-widest uppercase mb-3">FAQ</p>
          <h2 className="text-3xl font-bold text-white mb-12">Common questions</h2>
          <FAQAccordion />
        </div>
      </section>

      {/* ════════════════════════════════════════
          BOTTOM CTA
          ════════════════════════════════════════ */}
      <section
        className="py-24 px-4 text-center"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}
      >
        <div className="max-w-md mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 leading-tight">
            Ready to dispatch smarter?
          </h2>
          <p className="text-gray-500 text-sm mb-10">
            Join fleet operators across East Africa who start every shift with a clear weather signal.
          </p>
          <div className="space-y-3">
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-semibold py-3 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <GoogleIcon />
              Sign in with Google
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-3 rounded-xl text-white/60 text-sm hover:text-white hover:bg-white/5 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.12)' }}
            >
              Continue as Guest
            </button>
          </div>

          {/* Product labels */}
          <div className="flex justify-center gap-3 mt-10 flex-wrap">
            {['Daily Ops Brief', 'Dispatch Timeline', 'Impact Simulator'].map(label => (
              <span
                key={label}
                className="px-3 py-1.5 rounded-full text-gray-600 text-xs"
                style={{ border: '1px solid rgba(255,255,255,0.07)' }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function StatPill({ value }) {
  return (
    <div
      className="flex-1 text-center py-1.5 px-2 rounded-full text-gray-400 text-xs truncate"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
    >
      {value}
    </div>
  )
}

function WhyCard({ number, title, body }) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <span className="text-xs font-mono text-gray-700 mb-4 block">{number}</span>
      <h3 className="text-white font-semibold mb-2 text-base">{title}</h3>
      <p className="text-gray-500 text-sm leading-relaxed">{body}</p>
    </div>
  )
}

function StepCard({ step, title, body, connector }) {
  return (
    <div className="flex md:flex-col gap-5 md:gap-0 pb-8 md:pb-0 md:pr-8 relative">
      {connector && (
        <div
          className="hidden md:block absolute top-5 left-[calc(100%-1rem)] w-8 h-px"
          style={{ background: 'rgba(255,255,255,0.1)' }}
        />
      )}
      <div
        className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xs font-mono font-bold text-gray-400"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {step}
      </div>
      <div className="md:mt-5">
        <h3 className="text-white font-semibold mb-2 text-base">{title}</h3>
        <p className="text-gray-500 text-sm leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Wind scene — white ghost silhouettes filling the FAQ section
// ─────────────────────────────────────────────────────────────
const TREE_DATA = [
  { cx: 52,  h: 215, delay: 0    },
  { cx: 148, h: 300, delay: 0.45 },
  { cx: 232, h: 180, delay: 0.8  },
  { cx: 318, h: 155, delay: 0.25 },
  { cx: 430, h: 270, delay: 0.6  },
  { cx: 560, h: 190, delay: 0.15 },
  { cx: 665, h: 320, delay: 0.55 },
  { cx: 778, h: 225, delay: 0.35 },
  { cx: 872, h: 285, delay: 0.7  },
  { cx: 958, h: 170, delay: 0.1  },
]

// Particles spread over a tall area to fill the whole section
const PARTICLE_DATA = [
  { top: 28,  startX: -180, w: 90,  delay: 0,    alpha: 0.09 },
  { top: 72,  startX: -80,  w: 60,  delay: 0.7,  alpha: 0.06 },
  { top: 125, startX: -220, w: 110, delay: 1.4,  alpha: 0.08 },
  { top: 175, startX: -50,  w: 50,  delay: 2.1,  alpha: 0.06 },
  { top: 235, startX: -150, w: 85,  delay: 0.35, alpha: 0.07 },
  { top: 290, startX: -110, w: 100, delay: 1.05, alpha: 0.05 },
  { top: 345, startX: -190, w: 65,  delay: 1.75, alpha: 0.08 },
  { top: 395, startX: -70,  w: 45,  delay: 2.45, alpha: 0.05 },
  { top: 52,  startX: -240, w: 80,  delay: 0.55, alpha: 0.07 },
  { top: 150, startX: -130, w: 55,  delay: 1.25, alpha: 0.05 },
  { top: 205, startX: -95,  w: 75,  delay: 1.9,  alpha: 0.06 },
  { top: 315, startX: -160, w: 80,  delay: 0.9,  alpha: 0.08 },
  { top: 440, startX: -100, w: 55,  delay: 0.5,  alpha: 0.06 },
  { top: 470, startX: -200, w: 95,  delay: 1.6,  alpha: 0.07 },
]

const BASE = 490 // ground line in SVG user units (viewBox height = 500)

function WindScene({ windKph }) {
  const spd = windKph ?? 12
  const treeDuration = +(Math.max(0.9, 3.2 - spd * 0.042)).toFixed(2)
  const swayDeg      = +(Math.min(22, 2.5 + spd * 0.38)).toFixed(1)
  const partDuration = +(Math.max(1.0, 3.8 - spd * 0.048)).toFixed(2)

  return (
    // Absolute cover — fills the whole section behind the FAQ content
    <div
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none', overflow: 'hidden',
      }}
    >
      {/* Wind streak particles */}
      {PARTICLE_DATA.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: p.top,
            left: p.startX,
            width: p.w,
            height: 1,
            borderRadius: 1,
            background: `rgba(255, 255, 255, ${p.alpha})`,
            animation: `wind-particle ${partDuration}s ${p.delay}s linear infinite`,
          }}
        />
      ))}

      {/* Trees + grass — SVG, anchored to the bottom of the section */}
      <svg
        viewBox="0 0 1000 500"
        preserveAspectRatio="xMidYMax slice"
        style={{ position: 'absolute', bottom: 0, width: '100%', height: '90%' }}
        aria-hidden="true"
      >
        {/* Subtle ground line */}
        <rect x="0" y={BASE} width="1000" height="12" fill="rgba(255,255,255,0.03)" />

        {/* Grass blades */}
        {Array.from({ length: 36 }, (_, i) => {
          const gx  = 10 + i * 27.5
          const gh  = 10 + (i * 7) % 12
          return (
            <g
              key={`gr${i}`}
              style={{
                transformBox: 'fill-box',
                transformOrigin: 'bottom center',
                '--sway-deg': `${+(swayDeg * 1.8).toFixed(1)}deg`,
                animation: `tree-sway ${+(treeDuration * 0.6).toFixed(2)}s ${+((i * 0.11) % 1.1).toFixed(2)}s ease-in-out infinite`,
              }}
            >
              <path
                d={`M${gx} ${BASE} Q${gx + 4} ${BASE - gh} ${gx + 2} ${BASE - gh * 1.4}`}
                stroke="rgba(255,255,255,0.09)"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
              />
            </g>
          )
        })}

        {/* Trees */}
        {TREE_DATA.map((t, i) => (
          <g
            key={i}
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'bottom center',
              '--sway-deg': `${swayDeg}deg`,
              animation: `tree-sway ${treeDuration}s ${t.delay}s ease-in-out infinite`,
            }}
          >
            {/* Trunk */}
            <rect
              x={t.cx - 4} y={BASE - t.h}
              width="8" height={t.h}
              fill="rgba(255,255,255,0.10)" rx="3"
            />
            {/* Main canopy */}
            <ellipse
              cx={t.cx}           cy={BASE - t.h - t.h * 0.18}
              rx={t.h * 0.27}     ry={t.h * 0.31}
              fill="rgba(255,255,255,0.08)"
            />
            {/* Left sub-canopy */}
            <ellipse
              cx={t.cx - t.h * 0.19}  cy={BASE - t.h + t.h * 0.05}
              rx={t.h * 0.19}          ry={t.h * 0.23}
              fill="rgba(255,255,255,0.06)"
            />
            {/* Right sub-canopy */}
            <ellipse
              cx={t.cx + t.h * 0.19}  cy={BASE - t.h + t.h * 0.05}
              rx={t.h * 0.19}          ry={t.h * 0.23}
              fill="rgba(255,255,255,0.06)"
            />
            {/* Crown tip */}
            <ellipse
              cx={t.cx + t.h * 0.06}  cy={BASE - t.h - t.h * 0.31}
              rx={t.h * 0.11}          ry={t.h * 0.13}
              fill="rgba(255,255,255,0.05)"
            />
          </g>
        ))}
      </svg>

      {/* Wind speed — bottom-right corner */}
      <div
        style={{
          position: 'absolute', bottom: 14, right: 16,
          fontSize: 11, fontFamily: 'monospace',
          letterSpacing: '0.06em', color: 'rgba(255,255,255,0.15)',
        }}
      >
        {spd != null ? `${Math.round(spd)} km/h` : '— km/h'}
      </div>
    </div>
  )
}

const FAQ_ITEMS = [
  {
    q: 'Is DispatchIQ free to use?',
    a: 'The core weather signal and live status are completely free. Signed-in users unlock fleet history, personalized recommendations, and the full Impact Simulator.',
  },
  {
    q: 'How accurate is the weather data?',
    a: 'We use real-time meteorological data with sub-hourly updates. Conditions are refreshed on every session open, so the signal you see is always current.',
  },
  {
    q: 'Which cities are supported?',
    a: 'Any city worldwide — DispatchIQ detects your location automatically from your IP. East Africa is where we focus our risk calibration, but the tool works anywhere.',
  },
  {
    q: 'How is GREEN / AMBER / RED calculated?',
    a: 'Wind speed, precipitation, and visibility are each checked against rider-safety thresholds tuned for two-wheelers. Wind above 50 km/h or rain above 15 mm triggers RED, for example. One bad reading is enough to escalate the status.',
  },
  {
    q: 'Can I use this for a large fleet?',
    a: 'Yes. The Impact Simulator on the dashboard lets you enter any number of riders and orders, and projects on-time rates, delay risk, and recommended staffing based on the current forecast.',
  },
  {
    q: 'Does DispatchIQ work on mobile?',
    a: 'Fully. The interface is built mobile-first — dispatchers can check the signal from any phone or tablet before a shift starts.',
  },
]

function FAQAccordion() {
  const [open, setOpen] = useState(null)
  return (
    <div className="space-y-2">
      {FAQ_ITEMS.map((item, i) => (
        <div
          key={i}
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <button
            className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-white hover:text-white transition-colors"
            style={{ background: open === i ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)' }}
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span>{item.q}</span>
            <svg
              className="shrink-0 text-gray-400 transition-transform"
              style={{ transform: open === i ? 'rotate(45deg)' : 'rotate(0deg)' }}
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
          {open === i && (
            <div
              className="px-5 pb-4 text-sm text-gray-300 leading-relaxed"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  )
}
