import { useAppStore } from '../stores/appStore'
import { useI18n } from '../i18n'

interface Props {
  onClick?: () => void
}

export default function WelcomeScreen({ onClick }: Props) {
  const { setShowAddServer, servers } = useAppStore()
  const { t } = useI18n()

  return (
    <div className="welcome-screen">
      <div className="welcome-logo">⚡</div>
      <div className="welcome-title">XxTerm</div>
      <div className="welcome-subtitle">
        {t('welcome.subtitle')}
      </div>

      <div className="welcome-shortcuts">
        <div className="shortcut-card" onClick={() => setShowAddServer(true)}>
          <div className="shortcut-icon">＋</div>
          <div className="shortcut-label">{t('welcome.newConnection')}</div>
          <div className="shortcut-desc">{t('welcome.newConnection.desc')}</div>
        </div>
        <div className="shortcut-card" onClick={() => setShowAddServer(true)}>
          <div className="shortcut-icon">🔑</div>
          <div className="shortcut-label">{t('welcome.keyAuth')}</div>
          <div className="shortcut-desc">{t('welcome.keyAuth.desc')}</div>
        </div>
        <div className="shortcut-card">
          <div className="shortcut-icon">📁</div>
          <div className="shortcut-label">{t('welcome.fileManager')}</div>
          <div className="shortcut-desc">{t('welcome.fileManager.desc')}</div>
        </div>
        <div className="shortcut-card">
          <div className="shortcut-icon">🎨</div>
          <div className="shortcut-label">{t('welcome.themes')}</div>
          <div className="shortcut-desc">{t('welcome.themes.desc')}</div>
        </div>
      </div>

      {servers.length > 0 && (
        <div style={{
          marginTop: 8,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}>
          {t('welcome.serversCount', { count: servers.length })}
        </div>
      )}
    </div>
  )
}
