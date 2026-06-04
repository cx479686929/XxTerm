import { useAppStore } from '../stores/appStore'
import { themes } from '../themes'
import type { ThemeId } from '../types'
import { useState, useEffect } from 'react'
import { useI18n } from '../i18n'

export default function SettingsModal() {
  const { showSettings, setShowSettings, settings, updateSettings, setTheme } = useAppStore()
  const { t } = useI18n()
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.electron?.getVersion().then(v => { if (v) setAppVersion(v) })
  }, [])

  if (!showSettings) return null

  const fontFamilies = [
    '"JetBrains Mono", monospace',
    '"Fira Code", monospace',
    '"Cascadia Code", monospace',
    '"Source Code Pro", monospace',
    '"Monaco", monospace',
    '"Consolas", monospace',
    'monospace',
  ]

  return (
    <div className="modal-overlay" onClick={() => setShowSettings(false)}>
      <div
        className="modal-box"
        style={{ width: 600, maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">{t('settings.title')}</span>
          <button className="icon-btn" onClick={() => setShowSettings(false)}>✕</button>
        </div>

        <div className="settings-panel">
          {/* Themes */}
          <div className="settings-section">
            <div className="settings-section-title">{t('settings.section.theme')}</div>
            <div className="theme-grid">
              {Object.values(themes).map(theme => (
                <div
                  key={theme.id}
                  className={`theme-card ${settings.theme === theme.id ? 'active' : ''}`}
                  onClick={() => setTheme(theme.id as ThemeId)}
                >
                  <div
                    className="theme-preview"
                    style={{ background: theme.terminal.background }}
                  >
                    {/* Fake terminal lines */}
                    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ width: '60%', height: 4, borderRadius: 2, background: theme.terminal.green, opacity: 0.8 }} />
                      <div style={{ width: '40%', height: 4, borderRadius: 2, background: theme.terminal.blue, opacity: 0.7 }} />
                      <div style={{ width: '80%', height: 4, borderRadius: 2, background: theme.terminal.foreground, opacity: 0.3 }} />
                    </div>
                    <div className="theme-preview-bar">
                      {theme.preview.map((c, i) => (
                        <div key={i} className="theme-preview-bar-segment" style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                  <div className="theme-name">{theme.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Font */}
          <div className="settings-section">
            <div className="settings-section-title">{t('settings.section.font')}</div>

            <div className="settings-row">
              <div>
                <div className="settings-label">{t('settings.font.label')}</div>
                <div className="settings-desc">{t('settings.font.desc')}</div>
              </div>
              <select
                className="form-input form-select"
                style={{ width: 200 }}
                value={settings.fontFamily}
                onChange={e => updateSettings({ fontFamily: e.target.value })}
              >
                {fontFamilies.map(f => (
                  <option key={f} value={f}>{f.split(',')[0].replace(/"/g, '')}</option>
                ))}
              </select>
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-label">{t('settings.fontSize.label')}</div>
                <div className="settings-desc">{t('settings.fontSize.current', { size: settings.fontSize })}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  className="slider"
                  min={10}
                  max={24}
                  value={settings.fontSize}
                  onChange={e => updateSettings({ fontSize: parseInt(e.target.value) })}
                />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 30 }}>{settings.fontSize}</span>
              </div>
            </div>
          </div>

          {/* Terminal */}
          <div className="settings-section">
            <div className="settings-section-title">{t('settings.section.terminal')}</div>

            <div className="settings-row">
              <div>
                <div className="settings-label">{t('settings.cursorStyle.label')}</div>
              </div>
              <select
                className="form-input form-select"
                style={{ width: 120 }}
                value={settings.cursorStyle}
                onChange={e => updateSettings({ cursorStyle: e.target.value as any })}
              >
                <option value="block">{t('settings.cursorStyle.block')}</option>
                <option value="underline">{t('settings.cursorStyle.underline')}</option>
                <option value="bar">{t('settings.cursorStyle.bar')}</option>
              </select>
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-label">{t('settings.cursorBlink.label')}</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.cursorBlink}
                  onChange={e => updateSettings({ cursorBlink: e.target.checked })}
                />
                <span className="toggle-track" />
              </label>
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-label">{t('settings.scrollback.label')}</div>
                <div className="settings-desc">{t('settings.scrollback.desc')}</div>
              </div>
              <select
                className="form-input form-select"
                style={{ width: 120 }}
                value={settings.scrollback}
                onChange={e => updateSettings({ scrollback: parseInt(e.target.value) })}
              >
                <option value={1000}>1000</option>
                <option value={3000}>3000</option>
                <option value={5000}>5000</option>
                <option value={10000}>10000</option>
              </select>
            </div>
          </div>

          {/* Language */}
          <div className="settings-section">
            <div className="settings-section-title">{t('settings.section.language')}</div>
            <div className="settings-row">
              <div>
                <div className="settings-label">{t('settings.language.label')}</div>
                <div className="settings-desc">{t('settings.language.desc')}</div>
              </div>
              <select
                className="form-input form-select"
                style={{ width: 140 }}
                value={settings.language}
                onChange={e => updateSettings({ language: e.target.value as 'zh' | 'en' })}
              >
                <option value="zh">{t('settings.language.zh')}</option>
                <option value="en">{t('settings.language.en')}</option>
              </select>
            </div>
          </div>

          {/* About */}
          <div className="settings-section">
            <div className="settings-section-title">{t('settings.section.about')}</div>
            <div style={{
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                boxShadow: 'var(--glow)',
              }}>⚡</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>XxTerm</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>v{appVersion || '1.1.0'} · {t('settings.about.desc')}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {t('settings.about.tech')}
                </div>
              </div>
            </div>
          </div>

          <div style={{ height: 20 }} />
        </div>
      </div>
    </div>
  )
}
