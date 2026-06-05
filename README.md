# DispatchIQ

Weather-aware fleet dispatch intelligence for East African fleet operators. Tells dispatchers exactly when to send riders, when to hold, and what to expect for the next 7 days — powered by live weather data.

---

## What it does

DispatchIQ turns raw weather data into actionable dispatch decisions. Instead of guessing whether conditions are safe, a dispatcher opens the app and immediately sees one of three states:

| Status | Meaning |
|--------|---------|
| **CLEAR TO DISPATCH** | Conditions are safe. Maximize volume. |
| **DISPATCH WITH CAUTION** | Marginal conditions. Prioritize high-value orders only. |
| **HOLD DISPATCH** | Unsafe. Stage riders and wait for the clear window. |

### Core features

**Command Status Card**
The primary signal — a color-coded card (green / amber / red) with a live clock, a one-line briefing derived from the forecast (e.g. "Conditions deteriorate at 3 PM. Front-load all orders before then."), a trend badge showing whether conditions are improving or deteriorating over the next 3 hours, and a **Copy briefing** button that generates a plain-text shift handover note ready to paste into WhatsApp or a team channel.

**7-Day Outlook Strip**
A row of day tiles (Today through 6 days out) each colored green, amber, or red based on daily forecast data. Lets fleet managers plan staffing days ahead, not just hour by hour.

**Hourly Dispatch Signal**
A scrollable timeline of hourly blocks from the current hour forward. Each block shows the time, a CLEAR / PUSH / HOLD action, and a specific reason derived from real data values (e.g. "Rain likely", "Strong gusts", "Clear window").

**Impact Simulator**
Enter the number of active riders and expected orders. The app calculates recommended rider count, the best 2-hour dispatch window, projected on-time rate, and overall delay risk — all adjusted for current weather conditions.

**Fleet Preferences**
Signed-in users can save their fleet name, operating city, default rider count, daily order target, and operation type (Boda Boda, Matatu, Last Mile Delivery, etc.). These pre-fill the simulator automatically.

**Browser Notifications**
When the app is open in the background, it polls for weather changes every 15 minutes and fires a system notification if the dispatch status flips (e.g. GREEN to AMBER).

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite 8 |
| Styling | Tailwind CSS v4 |
| Routing | React Router v7 |
| Map | Leaflet + react-leaflet (CartoDB dark tiles) |
| Auth | Firebase Authentication (Google sign-in) |
| Database | Firebase Firestore (fleet preferences) |
| Weather | WeatherAI API (`api.weather-ai.co`) |

---

## Project structure

```
src/
├── components/
│   ├── Navbar.jsx          # Responsive nav — 2-row on mobile, single row on desktop
│   └── ProtectedRoute.jsx  # Redirects unauthenticated users away from /profile
├── config/
│   └── firebase.js         # Firebase app initialization
├── context/
│   ├── AuthContext.jsx     # Google sign-in, sign-out, user state
│   └── WeatherContext.jsx  # Geo-detected weather on load; exposes geoData, city, rateLimitRemaining
├── pages/
│   ├── Landing.jsx         # Full-screen Leaflet map hero + animated pin + Why / FAQ sections
│   ├── Dashboard.jsx       # Main dispatch console (status, weekly, hourly, simulator)
│   └── Profile.jsx         # Fleet preferences form, saved to Firestore
├── services/
│   └── weatherService.js   # Four fetch wrappers: current, hourly, weekly, geo-based
└── utils/
    └── dispatchLogic.js    # Pure functions: getRiderSafetyStatus, getHourlyRiskBlocks, getImpactEstimate
```

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd dispatchiq
npm install
```

### 2. Create your `.env` file

Copy the example and fill in your keys:

```bash
cp .env.example .env
```

Open `.env` and set the following values:

```env
VITE_API_BASE_URL=https://api.weather-ai.co
VITE_WEATHER_API_KEY=your_weatherai_api_key

VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

#### Getting a WeatherAI API key
Sign up at [weather-ai.co](https://weather-ai.co) and copy the Bearer token from your account dashboard.

#### Getting Firebase credentials
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project (or use an existing one)
3. Add a **Web app** — Firebase will show you a config object with all the values above
4. Enable **Authentication** → Sign-in method → **Google**
5. Enable **Firestore Database** → Start in production mode, then set this security rule so users can only read and write their own data:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 3. Run locally

```bash
npm run dev
```

The dev server starts at `http://localhost:5173`. The `/api` path is proxied to `https://api.weather-ai.co` during development so there are no CORS issues.

### 4. Build for production

```bash
npm run build
```

Output goes to `dist/`. Deploy the contents of `dist/` to any static host — Vercel, Netlify, Firebase Hosting, etc.

> **Note for production deployments:** Set all `VITE_*` environment variables in your hosting platform's dashboard. The Vite dev proxy only runs locally — in production the app calls `VITE_API_BASE_URL` directly, so make sure your hosting domain is allowed in the WeatherAI API's CORS settings, or route API requests through your own backend.

---

## How the weather logic works

All dispatch decisions live in `src/utils/dispatchLogic.js` as pure functions with no side effects.

**`getRiderSafetyStatus(current)`**
Checks wind speed, rainfall, and visibility against two-wheeler road-safety thresholds. Returns `GREEN`, `AMBER`, or `RED` with a plain-English reason.

| Condition | Threshold | Status |
|-----------|-----------|--------|
| Wind speed | > 50 km/h | RED |
| Rainfall | > 15 mm | RED |
| Visibility | < 0.2 km | RED |
| Wind speed | > 30 km/h | AMBER |
| Rainfall | > 5 mm | AMBER |
| Visibility | < 0.5 km | AMBER |
| Everything else | — | GREEN |

**`getHourlyRiskBlocks(hourlyData)`**
Scans each hour and assigns one of four operational signals:
- `NORMAL` — dispatch as usual
- `ACCELERATE` — next hour gets worse, push orders out now
- `HIGH_RISK` — hold new dispatches this hour
- `RESUME` — bad window ending, safe to restart

**`getImpactEstimate(riders, orders, hourlyData)`**
Models throughput degradation from weather. Each `HIGH_RISK` hour cuts effective rider capacity by 15% and drops the on-time rate by 10 percentage points (floor: 40%). Returns recommended rider count, best 2-hour dispatch window, projected on-time rate, and overall delay risk band (LOW / MEDIUM / HIGH).

---

## Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes | WeatherAI API base URL |
| `VITE_WEATHER_API_KEY` | Yes | WeatherAI Bearer token |
| `VITE_FIREBASE_API_KEY` | Yes | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firestore project ID |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase app ID |

---

## Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
