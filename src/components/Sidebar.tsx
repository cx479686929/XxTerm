import { useState, useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import type { ServerConfig } from '../types'
import { getServerColor } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { useI18n } from '../i18n'

export default function Sidebar() {
  const {
    servers,
    deleteServer,
    sidebarWidth,
    setSidebarWidth,
    setShowAddServer,
    setEditServerId,
    setShowSettings,
    addTab,
    tabs,
    setActiveTab,
    showFileManager,
    setShowFileManager,
    setShowMonitor,
    setShowCommandPalette,
  } = useAppStore()
  const { toast } = useToast()
  const { t } = useI18n()

  const [search, setSearch] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; server: ServerConfig } | null>(null)
  const [connecting, setConnecting] = useState<Set<string>>(new Set())
  const resizing = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingServer = useRef<ServerConfig | null>(null)

  const filtered = servers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.host.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    return () => {
      if (clickTimer.current) clearTimeout(clickTimer.current)
    }
  }, [])

  const handleServerClick = (server: ServerConfig) => {
    // Delay single click to distinguish from double click
    pendingServer.current = server
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => {
      if (pendingServer.current === server) {
        handleConnect(server)
      }
      clickTimer.current = null
      pendingServer.current = null
    }, 250)
  }

  const handleServerDoubleClick = (server: ServerConfig) => {
    // Cancel pending single click
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      pendingServer.current = null
    }
    handleConnect(server, 'terminal', true)
  }

  const handleConnect = useCallback(async (server: ServerConfig, type: 'terminal' | 'sftp' = 'terminal', forceNew = false) => {
    // Check existing tab (unless forceNew)
    if (!forceNew) {
      const existing = tabs.find(t => t.serverId === server.id && t.type === type)
      if (existing) {
        setActiveTab(existing.id)
        return
      }
    }

    const color = server.color ?? getServerColor(server.host)
    const tab = addTab({
      serverId: server.id,
      serverName: server.name,
      serverHost: `${server.username}@${server.host}`,
      type,
      status: 'connecting',
      title: server.name,
      color,
    })

    setConnecting(prev => new Set(prev).add(server.id))

    try {
      // Decrypt credentials before connecting
      const [password, privateKey, passphrase] = await Promise.all([
        server.password ? window.electron?.credentialsDecrypt(server.password) : Promise.resolve(undefined),
        server.privateKey ? window.electron?.credentialsDecrypt(server.privateKey) : Promise.resolve(undefined),
        server.passphrase ? window.electron?.credentialsDecrypt(server.passphrase) : Promise.resolve(undefined),
      ])

      const result = await window.electron?.sshConnect({
        id: tab.id,
        host: server.host,
        port: server.port,
        username: server.username,
        password: password ?? server.password,
        privateKey: privateKey ?? server.privateKey,
        passphrase: passphrase ?? server.passphrase,
      })

      if (result?.success) {
        useAppStore.getState().updateTab(tab.id, { status: 'connected' })
        useAppStore.getState().updateServer(server.id, { lastConnected: new Date().toISOString() })
        toast('success', t('server.connected', { name: server.name }))
      }
    } catch (err: any) {
      useAppStore.getState().updateTab(tab.id, { status: 'error' })
      toast('error', t('server.connectFailed', { error: err?.error ?? err?.message ?? t('server.unknownError') }))
    } finally {
      setConnecting(prev => {
        const s = new Set(prev)
        s.delete(server.id)
        return s
      })
    }
  }, [tabs, addTab, setActiveTab, toast])

  // Open or switch to local terminal
  const openLocalTerminal = useCallback(() => {
    // Reuse existing local tab if any
    const existing = tabs.find(t => t.type === 'local')
    if (existing) {
      setActiveTab(existing.id)
      return
    }
    addTab({
      serverId: '__local__',
      serverName: t('terminal.localTerminal'),
      serverHost: 'localhost',
      type: 'local',
      status: 'connected',
      title: t('terminal.localTerminal'),
      color: '#10b981',
    })
  }, [tabs, addTab, setActiveTab])

  // Resize logic
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizing.current = true
    startX.current = e.clientX
    startW.current = sidebarWidth
  }, [sidebarWidth])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return
      const delta = e.clientX - startX.current
      const newW = Math.max(180, Math.min(400, startW.current + delta))
      setSidebarWidth(newW)
    }
    const onUp = () => { resizing.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [setSidebarWidth])

  const handleContextMenu = (e: React.MouseEvent, server: ServerConfig) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, server })
  }

  useEffect(() => {
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  return (
    <>
      <div className="sidebar" style={{ width: sidebarWidth }}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">⚡</div>
            <span className="sidebar-logo-text">XxTerm</span>
          </div>
          <input
            className="sidebar-search"
            placeholder={t('server.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="server-list">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🖥️</div>
              <div className="empty-state-text">
                {search ? t('server.empty.noMatch') : t('server.empty.noServer')}
              </div>
            </div>
          ) : (
            <>
              <div className="server-group-label">{t('server.groupLabel')}</div>
              {filtered.map(server => {
                const color = server.color ?? getServerColor(server.host)
                const isConnecting = connecting.has(server.id)
                const connectedTab = tabs.find(t => t.serverId === server.id && t.status === 'connected')
                return (
                  <div
                    key={server.id}
                    className={`server-item ${connectedTab ? 'active' : ''}`}
                    onClick={() => handleServerClick(server)}
                    onDoubleClick={() => handleServerDoubleClick(server)}
                    onContextMenu={e => handleContextMenu(e, server)}
                  >
                    <span
                      className="server-dot"
                      style={{
                        color,
                        background: isConnecting ? undefined : (connectedTab ? color : 'transparent'),
                        border: connectedTab ? 'none' : `1.5px solid ${color}`,
                        animation: isConnecting ? 'pulse 1s infinite' : undefined,
                      }}
                    />
                    <div className="server-info">
                      <div className="server-name">{server.name}</div>
                      <div className="server-host">{server.username}@{server.host}:{server.port}</div>
                    </div>
                    <div className="server-actions">
                      <button
                        className="icon-btn"
                        data-tooltip={t('server.tooltip.fileManager')}
                        onClick={e => {
                          e.stopPropagation()
                          const existing = tabs.find(t => t.serverId === server.id && t.status === 'connected')
                          if (existing) {
                            setActiveTab(existing.id)
                          } else {
                            handleConnect(server, 'terminal')
                          }
                          setShowFileManager(true)
                        }}
                      >📂</button>
                      <button
                        className="icon-btn"
                        data-tooltip={t('server.tooltip.edit')}
                        onClick={e => {
                          e.stopPropagation()
                          setEditServerId(server.id)
                          setShowAddServer(true)
                        }}
                      >✏️</button>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>

        <div className="sidebar-bottom">
          <button className="sidebar-action" onClick={openLocalTerminal}>
            <span>💻</span>
            <span>{t('terminal.localTerminal')}</span>
          </button>
          <button className="sidebar-action accent" onClick={() => setShowAddServer(true)}>
            <span>＋</span>
            <span>{t('server.title.add').replace('＋ ', '')}</span>
          </button>
          <button className="sidebar-action" onClick={() => setShowFileManager(!showFileManager)}>
            <span>📁</span>
            <span>{t('fileManager.title')}</span>
          </button>
          <button className="sidebar-action" onClick={() => setShowCommandPalette(true)}>
            <span>⭐</span>
            <span>{t('commandPalette.tab.favorites').replace('⭐ ', '')}</span>
          </button>
          <button className="sidebar-action" onClick={() => setShowSettings(true)}>
            <span>⚙️</span>
            <span>{t('common.settings').replace('⚙️ ', '')}</span>
          </button>
        </div>
      </div>

      {/* Resize handle */}
      <div className="resize-handle" onMouseDown={onMouseDown} />

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={() => {
            handleConnect(contextMenu.server)
            setContextMenu(null)
          }}>
            {t('server.context.terminal')}
          </div>
          <div className="context-menu-item" onClick={() => {
            const existing = tabs.find(t => t.serverId === contextMenu.server.id && t.status === 'connected')
            if (existing) {
              setActiveTab(existing.id)
            } else {
              handleConnect(contextMenu.server, 'terminal')
            }
            setShowFileManager(true)
            setContextMenu(null)
          }}>
            {t('server.context.fileManager')}
          </div>
          <div className="context-menu-item" onClick={() => {
            const tab = tabs.find(t => t.serverId === contextMenu.server.id && t.status === 'connected')
            if (tab) {
              setShowMonitor({ tabId: tab.id, serverName: contextMenu.server.name })
            } else {
              toast('warning', t('server.monitor.warning'))
            }
            setContextMenu(null)
          }}>
            {t('server.context.monitor')}
          </div>
          <div className="context-menu-sep" />
          <div className="context-menu-item" onClick={() => {
            setEditServerId(contextMenu.server.id)
            setShowAddServer(true)
            setContextMenu(null)
          }}>
            {t('server.context.edit')}
          </div>
          <div className="context-menu-item danger" onClick={() => {
            deleteServer(contextMenu.server.id)
            toast('info', t('server.deleted', { name: contextMenu.server.name }))
            setContextMenu(null)
          }}>
            {t('server.context.delete')}
          </div>
        </div>
      )}
    </>
  )
}
