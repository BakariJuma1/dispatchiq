import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { getCurrentWeather, getWeatherByGeo } from '../services/weatherService'

const WeatherContext = createContext(null)

export function WeatherProvider({ children }) {
  const [geoData,    setGeoData]    = useState(null)
  const [city,       setCity]       = useState(null)
  const [geoLoading, setGeoLoading] = useState(true)
  const called = useRef(false)

  useEffect(() => {
    // Ref guard prevents StrictMode's double-invocation from firing two requests
    if (called.current) return
    called.current = true

    getWeatherByGeo()
      .then(async result => {
        console.log('[WeatherGeo] raw response:', result)
        let data = result?.data ?? null
        let resolvedCity = null

        if (!data) {
          console.warn('[WeatherGeo] geo lookup failed, falling back to Nairobi')
          const fallback = await getCurrentWeather(-1.2921, 36.8219)
          console.log('[WeatherGeo] Nairobi fallback response:', fallback)
          data = fallback?.data ?? null
          resolvedCity = 'Nairobi'
        } else {
          const timezone = data?.location?.timezone ?? data?.timezone ?? ''
          resolvedCity = timezone.includes('/')
            ? timezone.split('/').pop().replace(/_/g, ' ')
            : null
        }

        setGeoData(data)
        setCity(resolvedCity)
        setGeoLoading(false)
      })
      .catch(err => {
        console.error('[WeatherGeo] unexpected error:', err)
        setGeoLoading(false)
      })
  }, [])

  return (
    <WeatherContext.Provider value={{ geoData, city, geoLoading }}>
      {children}
    </WeatherContext.Provider>
  )
}

export function useWeather() {
  return useContext(WeatherContext)
}
