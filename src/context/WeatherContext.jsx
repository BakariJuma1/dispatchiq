import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { getCurrentWeather, getWeatherByGeo } from '../services/weatherService'

const WeatherContext = createContext(null)

export function WeatherProvider({ children }) {
  const [geoData,            setGeoData]            = useState(null)
  const [city,               setCity]               = useState(null)
  const [geoLoading,         setGeoLoading]         = useState(true)
  const [rateLimitRemaining, setRateLimitRemaining] = useState(null)
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    async function resolveCity(lat, lon) {
      try {
        const rev = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
          { headers: { 'Accept-Language': 'en' } }
        )
        const j = await rev.json()
        return j?.address?.city ?? j?.address?.town ?? j?.address?.village ?? j?.address?.county ?? null
      } catch {
        return null
      }
    }

    async function fetchWeather(lat, lon) {
      const result = await getWeatherByGeo(lat, lon)
      console.log('[WeatherGeo] raw response:', result)
      let data = result?.data ?? null

      if (!data) {
        console.warn('[WeatherGeo] lookup failed, falling back to Nairobi')
        const fallback = await getCurrentWeather(-1.2921, 36.8219)
        data = fallback?.data ?? null
        setRateLimitRemaining(fallback?.rateLimitRemaining ?? null)
        setCity('Nairobi')
      } else {
        setRateLimitRemaining(result?.rateLimitRemaining ?? null)
        const resLat = data?.location?.lat ?? lat
        const resLon = data?.location?.lon ?? lon
        const city = resLat != null ? await resolveCity(resLat, resLon) : null
        setCity(city)
      }

      setGeoData(data)
      setGeoLoading(false)
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => fetchWeather(coords.latitude, coords.longitude).catch(console.error),
        () => fetchWeather(null, null).catch(console.error),
        { timeout: 8000 }
      )
    } else {
      fetchWeather(null, null).catch(console.error)
    }
  }, [])

  return (
    <WeatherContext.Provider value={{ geoData, city, geoLoading, rateLimitRemaining }}>
      {children}
    </WeatherContext.Provider>
  )
}

export function useWeather() {
  return useContext(WeatherContext)
}
