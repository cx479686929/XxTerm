import { useAppStore } from '../stores/appStore'
import type { TabItem } from '../types'
import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, removeTab, addTab, updateTab, servers } = useAppStore()
  const { t } = useI18n()

  const clickTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingClickTabId = useRef<string | null>(null)

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeout.current) clearTimeout(clickTimeout.current)
    }
  }, [])

  const handleClick = (tab: TabItem) => {
    // Delay single click to wait for possible double click
    pendingClickTabId.current = tab.id
    if (clickTimeout.current) clearTimeout(clickTimeout.current)
    clickTimeout.current = setTimeout(() => {
      if (pendingClickTabId.current === tab.id) {
        setActiveTab(tab.id)
      }
      clickTimeout.current = null
      pendingClickTabId.current = null
    }, 200)
  }

  const handleDoubleClick = (tab: TabItem) => {
    // Cancel pending single click
    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current)
      clickTimeout.current = null
      pendingClickTabId.current = null
    }

    // Strip existing "(N)" suffix to get base title
    const baseTitle = (tab.type === 'local' ? t('terminal.localTerminal') : tab.title).replace(/\s*\(\d+\)$/, '')
    // Count existing tabs with same base title
    const sameCount = tabs.filter(tb => (tb.type === 'local' ? t('terminal.localTerminal') : tb.title).replace(/\s*\(\d+\)$/, '') === baseTitle).length
    const newTitle = sameCount > 0 ? `${baseTitle} (${sameCount + 1})` : baseTitle

    const newTab = {
      serverId: tab.serverId,
      serverName: tab.serverName,
      serverHost: tab.serverHost,
      type: tab.type,
      status: tab.type === 'local' ? 'connected' as const : 'disconnected' as const,
      title: newTitle,
      color: tab.color,
    }
    const created = addTab(newTab)

    // Auto-connect for SSH terminal tabs
    if (tab.type === 'terminal' && tab.serverId) {
      const server = servers.find(s => s.id === tab.serverId)
      if (server) {
        updateTab(created.id, { status: 'connecting' as const })
        ;(async () => {
          try {
            const [password, privateKey, passphrase] = await Promise.all([
              server.password ? window.electron?.credentialsDecrypt(server.password) : Promise.resolve(undefined),
              server.privateKey ? window.electron?.credentialsDecrypt(server.privateKey) : Promise.resolve(undefined),
              server.passphrase ? window.electron?.credentialsDecrypt(server.passphrase) : Promise.resolve(undefined),
            ])
            const result = await window.electron?.sshConnect({
              id: created.id,
              host: server.host,
              port: server.port,
              username: server.username,
              password: password ?? server.password,
              privateKey: privateKey ?? server.privateKey,
              passphrase: passphrase ?? server.passphrase,
            })
            if (result?.success) {
              updateTab(created.id, { status: 'connected' as const })
              useAppStore.getState().updateServer(server.id, { lastConnected: new Date().toISOString() })
            }
          } catch {
            updateTab(created.id, { status: 'error' as const })
          }
        })()
      }
    }

    // 如果是本地终端，自动启动 shell
    if (tab.type === 'local') {
      setTimeout(() => {
        window.electron?.localShell({ id: created.id, cols: 80, rows: 24 })
      }, 100)
    }
  }

  const statusColor: Record<string, string> = {
    connecting: '#f59e0b',
    connected: '#10b981',
    disconnected: '#9090a8',
    error: '#ef4444',
  }

  return (
    <div className="tab-bar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => handleClick(tab)}
          onDoubleClick={() => handleDoubleClick(tab)}
          title={t('terminal.tab.tooltip')}
        >
          <span
            className={`tab-dot ${tab.status === 'connecting' ? 'connecting' : ''}`}
            style={{ background: tab.color ?? statusColor[tab.status] ?? '#7c3aed' }}
          />
          <span className="tab-title">
            {tab.type === 'local' ? t('terminal.localTerminal') : tab.title}
          </span>
          <button
            className="tab-close"
            onClick={e => {
              e.stopPropagation()
              if (tab.type === 'terminal' || tab.type === 'local') {
                window.electron?.sshDisconnect?.(tab.id)
                window.electron?.localDisconnect?.(tab.id)
              }
              removeTab(tab.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
