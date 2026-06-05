import { useEffect, useRef, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../config/firebase'
import { useAuth } from '../context/AuthContext'

const CITIES = [
  { name: 'Nairobi',       lat: -1.2921,  lon: 36.8219 },
  { name: 'Mombasa',       lat: -4.0435,  lon: 39.6682 },
  { name: 'Kisumu',        lat: -0.1022,  lon: 34.7617 },
  { name: 'Nakuru',        lat: -0.3031,  lon: 36.0800 },
  { name: 'Kampala',       lat:  0.3476,  lon: 32.5825 },
  { name: 'Dar es Salaam', lat: -6.7924,  lon: 39.2083 },
]

const OPERATION_TYPES = [
  'Boda Boda Network',
  'Matatu Operator',
  'Last Mile Delivery',
  'Field Sales Team',
  'Mixed Fleet',
]

const EMPTY_FORM = {
  fleetName:     '',
  city:          '',
  riderCount:    '',
  dailyOrders:   '',
  operationType: '',
}

function firestorePath(uid) {
  return doc(db, 'users', uid, 'preferences', 'fleet')
}

export default function Profile() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [form,        setForm]        = useState(EMPTY_FORM)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [hasExisting, setHasExisting] = useState(false)
  const successTimer = useRef(null)

  // Load existing prefs on mount
  useEffect(() => {
    if (!user) return
    getDoc(firestorePath(user.uid))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data()
          setForm({
            fleetName:     data.fleetName     ?? '',
            city:          data.city          ?? '',
            riderCount:    data.riderCount    != null ? String(data.riderCount)  : '',
            dailyOrders:   data.dailyOrders   != null ? String(data.dailyOrders) : '',
            operationType: data.operationType ?? '',
          })
          setHasExisting(true)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  const set = field => e => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSave = async e => {
    e.preventDefault()
    if (!user || saving) return

    const selectedCity = CITIES.find(c => c.name === form.city)

    setSaving(true)
    try {
      await setDoc(firestorePath(user.uid), {
        fleetName:     form.fleetName.trim(),
        city:          form.city,
        lat:           selectedCity?.lat ?? null,
        lon:           selectedCity?.lon ?? null,
        riderCount:    form.riderCount  ? Number(form.riderCount)  : null,
        dailyOrders:   form.dailyOrders ? Number(form.dailyOrders) : null,
        operationType: form.operationType,
        updatedAt:     new Date().toISOString(),
      }, { merge: true })

      setHasExisting(true)
      setSaved(true)
      clearTimeout(successTimer.current)
      successTimer.current = setTimeout(() => setSaved(false), 3000)
    } catch {
      // Silent failure — user can retry
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-xl mx-auto px-4 py-8 space-y-8">

        {/* Nav */}
        <header className="flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </button>
          <button
            onClick={signOut}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Sign out
          </button>
        </header>

        {/* User identity */}
        <div className="flex items-center gap-4">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-full ring-2 ring-gray-800"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center text-xl font-bold text-gray-400">
              {user.displayName?.charAt(0) ?? '?'}
            </div>
          )}
          <div>
            <p className="font-semibold text-white">{user.displayName}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>

        {/* First-time prompt */}
        {!loading && !hasExisting && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4">
            <p className="text-sm text-gray-400 leading-relaxed">
              Set up your fleet profile to get personalised dispatch recommendations.
            </p>
          </div>
        )}

        {/* Form */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-24 bg-gray-800 rounded animate-pulse" />
                <div className="h-10 bg-gray-900 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">

            <Field label="Fleet Name">
              <input
                type="text"
                value={form.fleetName}
                onChange={set('fleetName')}
                placeholder="e.g. Rocket Riders Nairobi"
                className={inputClass}
              />
            </Field>

            <Field label="Operating City">
              <select
                value={form.city}
                onChange={set('city')}
                className={`${inputClass} ${form.city ? 'text-white' : 'text-gray-600'}`}
              >
                <option value="" disabled className="text-gray-600 bg-gray-900">Select a city</option>
                {CITIES.map(c => (
                  <option key={c.name} value={c.name} className="text-white bg-gray-900">
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Default Rider Count">
                <input
                  type="number"
                  min="1"
                  value={form.riderCount}
                  onChange={set('riderCount')}
                  placeholder="e.g. 24"
                  className={`${inputClass} ${noSpinners}`}
                />
              </Field>

              <Field label="Default Daily Orders">
                <input
                  type="number"
                  min="1"
                  value={form.dailyOrders}
                  onChange={set('dailyOrders')}
                  placeholder="e.g. 120"
                  className={`${inputClass} ${noSpinners}`}
                />
              </Field>
            </div>

            <Field label="Operation Type">
              <select
                value={form.operationType}
                onChange={set('operationType')}
                className={`${inputClass} ${form.operationType ? 'text-white' : 'text-gray-600'}`}
              >
                <option value="" disabled className="text-gray-600 bg-gray-900">Select type</option>
                {OPERATION_TYPES.map(t => (
                  <option key={t} value={t} className="text-white bg-gray-900">{t}</option>
                ))}
              </select>
            </Field>

            {/* Save row */}
            <div className="flex items-center gap-4 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-white text-gray-900 font-semibold rounded-lg text-sm
                           hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Save Preferences'}
              </button>

              {saved && (
                <span className="text-sm text-green-400 animate-fade-in">
                  Preferences saved
                </span>
              )}
            </div>

          </form>
        )}

      </div>
    </div>
  )
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  )
}

// ─── Shared input classes ─────────────────────────────────────────────────────

const inputClass = `
  w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white
  focus:outline-none focus:border-gray-600 transition-colors
  placeholder:text-gray-700
`.trim()

const noSpinners = `
  [appearance:textfield]
  [&::-webkit-inner-spin-button]:appearance-none
  [&::-webkit-outer-spin-button]:appearance-none
`.trim()
