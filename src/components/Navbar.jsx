import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar({ city, cityLoading }) {
  const { user, googleSignIn, signOut } = useAuth()
  const navigate = useNavigate()

  const navLink = ({ isActive }) =>
    `text-xs transition-colors ${isActive ? 'text-white font-medium' : 'text-gray-500 hover:text-gray-300'}`

  return (
    <header className="border-b border-gray-900">

      {/* ── Row 1: brand + auth (always) ─────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 py-4">

        {/* Left: brand + desktop nav */}
        <div className="flex items-center gap-5 shrink-0">
          <button
            onClick={() => navigate(user ? '/dashboard' : '/')}
            className="text-base font-bold tracking-tight hover:text-gray-300 transition-colors"
          >
            DispatchIQ
          </button>

          {/* Nav links — desktop only */}
          <nav className="hidden sm:flex items-center gap-4">
            <NavLink to="/dashboard" className={navLink}>Dashboard</NavLink>
            {user && <NavLink to="/profile" className={navLink}>Fleet Prefs</NavLink>}
          </nav>
        </div>

        {/* Center: city — desktop only */}
        <div className="hidden sm:block flex-1 text-center">
          {cityLoading ? (
            <div className="h-3.5 w-20 bg-gray-800 rounded-full animate-pulse mx-auto" />
          ) : city ? (
            <span className="text-xs text-gray-400">{city}</span>
          ) : null}
        </div>

        {/* Right: auth */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <>
              {user.photoURL && (
                <img
                  src={user.photoURL}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full ring-1 ring-gray-700 cursor-pointer"
                  onClick={() => navigate('/profile')}
                />
              )}
              {/* Sign out — desktop only; mobile shows it in row 2 */}
              <button
                onClick={signOut}
                className="hidden sm:block text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={() => googleSignIn().catch(() => {})}
              className="text-xs bg-white text-gray-900 font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      </div>

      {/* ── Row 2: nav links + city + sign out — mobile only ─────────────── */}
      <div className="flex sm:hidden items-center justify-between pb-3">
        <nav className="flex items-center gap-4">
          <NavLink to="/dashboard" className={navLink}>Dashboard</NavLink>
          {user && <NavLink to="/profile" className={navLink}>Fleet Prefs</NavLink>}
        </nav>

        <div className="flex items-center gap-3">
          {cityLoading ? (
            <div className="h-3 w-14 bg-gray-800 rounded-full animate-pulse" />
          ) : city ? (
            <span className="text-xs text-gray-500">{city}</span>
          ) : null}

          {user && (
            <button
              onClick={signOut}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Sign out
            </button>
          )}
        </div>
      </div>

    </header>
  )
}
