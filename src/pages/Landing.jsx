import { useNavigate } from 'react-router-dom'
import { getRiderSafetyStatus } from '../utils/dispatchLogic'
import { useAuth } from '../context/AuthContext'
import { useWeather } from '../context/WeatherContext'
import Navbar from '../components/Navbar'

const STATUS_STYLES = {
  GREEN: { bg: 'bg-green-500',  text: 'text-white' },
  AMBER: { bg: 'bg-amber-400',  text: 'text-black' },
  RED:   { bg: 'bg-red-600',    text: 'text-white' },
}

export default function Landing() {
  const { googleSignIn } = useAuth()
  const { geoData, city, geoLoading } = useWeather()
  const navigate = useNavigate()

  const current   = geoData?.current ?? geoData?.current_weather ?? geoData?.weather ?? {}
  const safety    = getRiderSafetyStatus(geoData ? current : null)
  const briefing  = geoData?.ai_summary ?? geoData?.briefing ?? geoData?.summary ?? null
  const statusStyle = STATUS_STYLES[safety.status] ?? STATUS_STYLES.AMBER

  const handleGoogleSignIn = async () => {
    try { await googleSignIn() } catch { /* auth state handles redirect */ }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="max-w-2xl w-full mx-auto px-4">
        <Navbar city={city} cityLoading={geoLoading} />
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-8">

          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight">DispatchIQ</h1>
            <p className="mt-1 text-gray-400 text-sm">Weather-aware fleet dispatch</p>
          </div>

          <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 space-y-3">
            {geoLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-5 bg-gray-700 rounded w-1/3" />
                <div className="h-4 bg-gray-700 rounded w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">{city ?? 'Detected Location'}</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusStyle.bg} ${statusStyle.text}`}>
                    {safety.status}
                  </span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">
                  {briefing ?? safety.reason}
                </p>
              </>
            )}
          </div>

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
              className="w-full py-3 rounded-xl border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white transition-colors text-sm"
            >
              Continue as Guest
            </button>
          </div>

        </div>
      </div>
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
