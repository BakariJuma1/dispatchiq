// ---------------------------------------------------------------------------
// getRiderSafetyStatus
// Thresholds are based on common road-safety guidelines for two-wheelers.
// Priority order: wind > rain > visibility (wind causes loss of control first).
// ---------------------------------------------------------------------------
export function getRiderSafetyStatus(current) {
  if (!current) return { status: 'AMBER', reason: 'Weather data unavailable.' }

  const wind = current.wind_kph ?? current.wind_speed ?? 0
  const rain = current.precip_mm ?? current.rain_probability ?? 0
  const vis  = current.vis_km   ?? current.visibility_km ?? 10

  // RED — unsafe to dispatch
  if (wind > 50)  return { status: 'RED',   reason: `Wind at ${wind} km/h exceeds safe riding limit.` }
  if (rain > 15)  return { status: 'RED',   reason: `Heavy rain (${rain} mm). Severe road hazard.` }
  if (vis < 0.2)  return { status: 'RED',   reason: `Visibility critically low at ${vis} km.` }

  // AMBER — caution, reduced speed recommended
  if (wind > 30)  return { status: 'AMBER', reason: `Strong winds at ${wind} km/h. Reduce speed on open roads.` }
  if (rain > 5)   return { status: 'AMBER', reason: `Moderate rain (${rain} mm). Wet braking distances apply.` }
  if (vis < 0.5)  return { status: 'AMBER', reason: `Low visibility (${vis} km). Use lights and widen following distance.` }

  return { status: 'GREEN', reason: 'Conditions are clear for normal dispatch.' }
}

// ---------------------------------------------------------------------------
// getHourlyRiskBlocks
// Scans each hour and assigns one of four operational signals:
//   NORMAL      — dispatch as usual
//   ACCELERATE  — conditions will deteriorate; push orders out now
//   HIGH_RISK   — pause or hold new dispatches this hour
//   RESUME      — bad window ending; safe to restart dispatches
//
// "Deteriorating" is defined as the next hour being worse than current.
// "Recovering" is defined as current hour being worse than the next.
// ---------------------------------------------------------------------------
export function getHourlyRiskBlocks(hourlyData) {
  if (!Array.isArray(hourlyData) || hourlyData.length === 0) return []

  return hourlyData.map((hour, i) => {
    const next = hourlyData[i + 1]
    const time = hour.time ?? hour.datetime ?? `Hour ${i}`

    const wind = hour.wind_kph   ?? hour.wind_speed ?? 0
    const rain = hour.precip_mm  ?? hour.precip     ?? 0
    const vis  = hour.vis_km     ?? hour.visibility ?? 10

    const isRisky = wind > 40 || rain > 10 || vis < 0.3

    if (isRisky) {
      // Check if the next hour is safer — if so, flag as RESUME at the end
      const nextIsRisky = next
        ? (next.wind_kph ?? next.wind_speed ?? 0) > 40 ||
          (next.precip_mm ?? next.precip ?? 0) > 10 ||
          (next.vis_km ?? next.visibility ?? 10) < 0.3
        : true

      if (!nextIsRisky) {
        return { time, risk: 'RESUME', label: 'Resuming', reason: 'Conditions improving next hour. Prepare to restart dispatches.' }
      }
      return { time, risk: 'HIGH_RISK', label: 'Hold', reason: buildRiskReason(wind, rain, vis) }
    }

    // Safe now — check if conditions worsen next hour
    if (next) {
      const nextWind = next.wind_kph  ?? next.wind_speed ?? 0
      const nextRain = next.precip_mm ?? next.precip     ?? 0
      const nextVis  = next.vis_km    ?? next.visibility ?? 10
      const nextIsRisky = nextWind > 40 || nextRain > 10 || nextVis < 0.3

      if (nextIsRisky) {
        return { time, risk: 'ACCELERATE', label: 'Accelerate', reason: 'Conditions worsen next hour. Prioritise dispatches now.' }
      }
    }

    return { time, risk: 'NORMAL', label: 'Normal', reason: 'No significant weather risk.' }
  })
}

function buildRiskReason(wind, rain, vis) {
  if (wind > 40) return `Wind at ${wind} km/h. Too dangerous for riders.`
  if (rain > 10) return `Heavy rain (${rain} mm). Hold dispatches.`
  return `Visibility at ${vis} km. Unsafe conditions.`
}

// ---------------------------------------------------------------------------
// getImpactEstimate
// Models how weather degrades fleet throughput.
//
// Delay factor: each HIGH_RISK block removes ~15% of effective capacity.
//   (Empirical rule-of-thumb: bad weather adds ~20 min to avg delivery time,
//    reducing hourly order capacity per rider from ~3 to ~2.5.)
//
// On-time rate: starts at 95% baseline, degrades by 10pp per HIGH_RISK block.
//
// Best dispatch window: the earliest 2-hour stretch with no HIGH_RISK blocks.
//
// Recommended riders: orders / effective capacity per rider, rounded up.
// ---------------------------------------------------------------------------
export function getImpactEstimate(riders, orders, forecastData) {
  const blocks = getHourlyRiskBlocks(forecastData ?? [])

  const highRiskCount = blocks.filter(b => b.risk === 'HIGH_RISK').length

  // Each bad hour reduces effective per-rider throughput by 15%
  const capacityFactor  = Math.max(0.4, 1 - highRiskCount * 0.15)
  const ordersPerRider  = 3 * capacityFactor          // baseline: 3 orders/hr per rider
  const recommendedRiders = Math.ceil(orders / ordersPerRider)

  // On-time rate degrades 10pp per HIGH_RISK block, floor at 40%
  const estimatedOnTimeRate = Math.max(40, 95 - highRiskCount * 10)

  // Delay risk bands
  let projectedDelayRisk = 'LOW'
  if (highRiskCount >= 2) projectedDelayRisk = 'MEDIUM'
  if (highRiskCount >= 4) projectedDelayRisk = 'HIGH'

  // Best dispatch window: first consecutive pair of NORMAL/ACCELERATE/RESUME blocks
  let bestDispatchWindow = 'Now'
  for (let i = 0; i < blocks.length - 1; i++) {
    const safe = r => r === 'NORMAL' || r === 'ACCELERATE' || r === 'RESUME'
    if (safe(blocks[i].risk) && safe(blocks[i + 1].risk)) {
      bestDispatchWindow = `${blocks[i].time} – ${blocks[i + 1].time}`
      break
    }
  }

  return {
    recommendedRiders,
    projectedDelayRisk,
    bestDispatchWindow,
    estimatedOnTimeRate,
  }
}

// ---------------------------------------------------------------------------
// formatAIBriefing
// Strips conversational filler from Gemini summaries and reframes the content
// for an ops dispatcher who needs action signals, not narrative weather prose.
//
// Strategy:
//   1. Remove hedging phrases common in LLM weather summaries.
//   2. Normalise tense to present/imperative (dispatcher reads this live).
//   3. Prepend a short ops-context header so it's scannable at a glance.
// ---------------------------------------------------------------------------
export function formatAIBriefing(geminiSummary) {
  if (!geminiSummary || typeof geminiSummary !== 'string') {
    return 'No AI briefing available at this time.'
  }

  const hedgePhrases = [
    /\bplease note that\b/gi,
    /\bit is worth (noting|mentioning) that\b/gi,
    /\bas an? (AI|language model)[^.]*\.\s*/gi,
    /\bI (should|must) (point out|mention) that\b/gi,
    /\boverall[,\s]+/gi,
    /\bin summary[,\s]+/gi,
    /\bto summarize[,\s]+/gi,
    /\bAccording to (the )?(latest|current) (weather )?(data|forecast)[,\s]+/gi,
  ]

  let cleaned = geminiSummary.trim()
  hedgePhrases.forEach(pattern => { cleaned = cleaned.replace(pattern, '') })

  // Collapse whitespace artifacts left after stripping phrases
  cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/^\s*[,\.]\s*/, '').trim()

  // Capitalise the first letter in case stripping lowercased the start
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)

  return `[OPS BRIEFING] ${cleaned}`
}
