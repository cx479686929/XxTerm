import { createContext, useContext, useMemo } from 'react'
import type { Locale, LocaleMessages } from './types'
import zh from './zh'
import en from './en'

const messages: Record<Locale, LocaleMessages> = { zh, en }

/**
 * Resolve a dot-separated key like "server.title.add" from a LocaleMessages object.
 * Falls back through each module if key not found (e.g. "common.cancel" in server context).
 */
function resolve(obj: LocaleMessages, key: string): string | undefined {
  const [mod, ...rest] = key.split('.')
  const subKey = rest.join('.')
  const module = obj[mod as keyof LocaleMessages]
  if (module && subKey in module) return module[subKey]
  return undefined
}

/**
 * Interpolate {variable} placeholders in a string.
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`
  )
}

/**
 * Main translation function.
 * Key format: "module.key" (e.g. "server.title.add", "common.cancel").
 * Falls back to zh if key missing in current locale, then returns the key itself.
 */
export function t(key: string, params?: Record<string, string | number>, locale: Locale = 'zh'): string {
  const current = messages[locale]
  let value = resolve(current, key)
  if (value === undefined) {
    // Fallback to zh
    value = resolve(messages.zh, key)
  }
  if (value === undefined) {
    // Last resort: return the key
    return key
  }
  return interpolate(value, params)
}

// ─── React context & hook ───────────────────────────────────────────────────

interface I18nContextValue {
  locale: Locale
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'zh',
  t: (key, params) => t(key, params, 'zh'),
})

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo<I18nContextValue>(() => ({
    locale,
    t: (key, params) => t(key, params, locale),
  }), [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}

export type { Locale }
