import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { getWeatherByGeo } from '../services/weatherService'

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

    getWeatherByGeo().then(result => {
      console.log('[WeatherGeo] raw response:', result)
      const data = result?.data ?? null
      setGeoData(data)
      const loc = data?.location ?? data?.city_info ?? {}
      setCity(loc.name ?? loc.city ?? data?.city ?? null)
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
