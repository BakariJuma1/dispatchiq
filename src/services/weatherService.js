const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const API_KEY = import.meta.env.VITE_WEATHER_API_KEY

async function request(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })

    const text = await res.text()
    console.log(`[WeatherAPI] ${path} → status=${res.status}`, text)

    if (!res.ok) return null

    const data = JSON.parse(text)
    const rateLimitRemaining = res.headers.get('X-RateLimit-Remaining')

    return { data, rateLimitRemaining }
  } catch (err) {
    console.error(`[WeatherAPI] ${path} threw:`, err)
    return null
  }
}

export const getCurrentWeather = (lat, lon) =>
  request('/v1/current', { lat, lon })

export const getHourlyForecast = (lat, lon) =>
  request('/v1/hourly', { lat, lon, days: 2 })

export const getWeatherByGeo = () =>
  request('/v1/weather-geo', { ip: 'auto', ai: true })

export const getWeeklyForecast = (lat, lon) =>
  request('/v1/weather', { lat, lon, days: 7, ai: true })
