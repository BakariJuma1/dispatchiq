import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar({ city, cityLoading }) {
  const { user, googleSignIn, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="flex items-center justify-between gap-4 py-4 border-b border-gray-900">

      {/* Left — brand + nav links */}
      <div className="flex items-center gap-5 shrink-0">
        <button
          onClick={() => navigate(user ? '/dashboard' : '/')}
          className="text-base font-bold tracking-tight hover:text-gray-300 transition-colors"
        >
          DispatchIQ
        </button>

        <nav className="flex items-center gap-4">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `text-xs transition-colors ${isActive ? 'text-white font-medium' : 'text-gray-500 hover:text-gray-300'}`
            }
          >
            Dashboard
          </NavLink>
          {user && (
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `text-xs transition-colors ${isActive ? 'text-white font-medium' : 'text-gray-500 hover:text-gray-300'}`
              }
            >
              Fleet Prefs
            </NavLink>
          )}
        </nav>
      </div>

      {/* Center — detected city */}
      <div className="flex-1 text-center">
        {cityLoading ? (
          <div className="h-3.5 w-20 bg-gray-800 rounded-full animate-pulse mx-auto" />
        ) : city ? (
          <span className="text-xs text-gray-400">{city}</span>
        ) : null}
      </div>

      {/* Right — auth */}
      <div className="flex items-center gap-3 shrink-0 justify-end">
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
            <button
              onClick={signOut}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
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

    </header>
  )
}
