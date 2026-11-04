import { useCallback, useMemo } from 'react'
import { useI18n } from './I18nProvider'

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

export function useRelativeTime(): (date: Date | number) => string {
  const { locale } = useI18n()
  const format = useMemo(() => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }), [locale])
  return useCallback(
    (date) => {
      const milliseconds = typeof date === 'number' ? date : date.getTime()
      if (!milliseconds) return ''
      const diff = (milliseconds - Date.now()) / 1000
      const [unit, size] = UNITS.find(([, seconds]) => Math.abs(diff) >= seconds) ?? ['minute', 60]
      return format.format(Math.round(diff / size), unit)
    },
    [format],
  )
}
