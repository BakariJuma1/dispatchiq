const BASE_URL = 'https://api.weather-ai.co'
const API_KEY = import.meta.env.VITE_WEATHER_API_KEY

async function request(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })

    if (!res.ok) return null

    const data = await res.json()
    const rateLimitRemaining = res.headers.get('X-RateLimit-Remaining')

    return { data, rateLimitRemaining }
  } catch {
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
