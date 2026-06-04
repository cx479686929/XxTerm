/** Flat key-value translation map */
export type TranslationMap = Record<string, string>

/** All module translation maps */
export interface LocaleMessages {
  common: TranslationMap
  server: TranslationMap
  terminal: TranslationMap
  fileManager: TranslationMap
  commandPalette: TranslationMap
  monitor: TranslationMap
  settings: TranslationMap
  welcome: TranslationMap
}

export type Locale = 'zh' | 'en'
