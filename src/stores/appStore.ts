import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ServerConfig, TabItem, AppSettings, ThemeId } from '../types'
import { themes } from '../themes'
import { nanoid } from '../utils/nanoid'

const ENC_PREFIX = 'enc:v1:'

/** Encrypt sensitive fields via main process safeStorage */
async function encryptField(value: string | undefined): Promise<string | undefined> {
  if (!value) return undefined
  // Skip if already encrypted to avoid double-encryption
  if (value.startsWith(ENC_PREFIX)) return value
  try {
    return await window.electron?.credentialsEncrypt(value)
  } catch {
    return value
  }
}

/** Encrypt all sensitive fields of a server config */
async function encryptServerFields(server: Partial<ServerConfig>): Promise<Partial<ServerConfig>> {
  const [password, privateKey, passphrase] = await Promise.all([
    encryptField(server.password),
    encryptField(server.privateKey),
    encryptField(server.passphrase),
  ])
  return { ...server, password, privateKey, passphrase }
}

interface AppStore {
  // Servers
  servers: ServerConfig[]
  addServer: (server: Omit<ServerConfig, 'id'>) => ServerConfig
  updateServer: (id: string, updates: Partial<ServerConfig>) => void
  deleteServer: (id: string) => void

  // Tabs
  tabs: TabItem[]
  activeTabId: string | null
  addTab: (tab: Omit<TabItem, 'id'>) => TabItem
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, updates: Partial<TabItem>) => void

  // UI
  sidebarWidth: number
  setSidebarWidth: (w: number) => void
  showFileManager: boolean
  setShowFileManager: (v: boolean) => void
  showSettings: boolean
  setShowSettings: (v: boolean) => void
  showAddServer: boolean
  setShowAddServer: (v: boolean) => void
  editServerId: string | null
  setEditServerId: (id: string | null) => void
  monitorTab: { tabId: string; serverName: string } | null
  setShowMonitor: (v: { tabId: string; serverName: string } | null) => void

  // Settings
  settings: AppSettings
  updateSettings: (updates: Partial<AppSettings>) => void
  setTheme: (theme: ThemeId) => void

  // Migration
  migrateCredentials: () => Promise<void>
}

const defaultSettings: AppSettings = {
  fontSize: 14,
  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 5000,
  theme: 'midnight',
  language: 'zh',
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      servers: [],
      addServer: (server) => {
        const newServer = { ...server, id: nanoid() }
        set(s => ({ servers: [...s.servers, newServer] }))
        // Encrypt sensitive fields in background
        encryptServerFields(newServer).then(encrypted => {
          set(s => ({
            servers: s.servers.map(sv => sv.id === encrypted.id ? { ...sv, ...encrypted } as ServerConfig : sv)
          }))
        })
        return newServer
      },
      updateServer: (id, updates) => {
        // Merge updates into existing server, encrypt sensitive fields
        const existing = get().servers.find(sv => sv.id === id)
        const merged = existing ? { ...existing, ...updates } : updates
        set(s => ({ servers: s.servers.map(sv => sv.id === id ? { ...sv, ...updates } : sv) }))
        // Encrypt sensitive fields in background
        encryptServerFields(merged).then(encrypted => {
          set(s => ({
            servers: s.servers.map(sv => sv.id === id ? { ...sv, ...encrypted } as ServerConfig : sv)
          }))
        })
      },
      deleteServer: (id) =>
        set(s => ({ servers: s.servers.filter(sv => sv.id !== id) })),

      tabs: [],
      activeTabId: null,
      addTab: (tab) => {
        const newTab = { ...tab, id: nanoid() }
        set(s => ({ tabs: [...s.tabs, newTab], activeTabId: newTab.id }))
        return newTab
      },
      removeTab: (id) =>
        set(s => {
          const newTabs = s.tabs.filter(t => t.id !== id)
          const newActive = s.activeTabId === id
            ? (newTabs[newTabs.length - 1]?.id ?? null)
            : s.activeTabId
          return { tabs: newTabs, activeTabId: newActive }
        }),
      setActiveTab: (id) => set({ activeTabId: id }),
      updateTab: (id, updates) =>
        set(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, ...updates } : t) })),

      sidebarWidth: 260,
      setSidebarWidth: (w) => set({ sidebarWidth: w }),
      showFileManager: false,
      setShowFileManager: (v) => set({ showFileManager: v }),
      showSettings: false,
      setShowSettings: (v) => set({ showSettings: v }),
      showAddServer: false,
      setShowAddServer: (v) => set({ showAddServer: v }),
      editServerId: null,
      setEditServerId: (id) => set({ editServerId: id }),
      monitorTab: null,
      setShowMonitor: (v) => set({ monitorTab: v }),

      settings: defaultSettings,
      updateSettings: (updates) =>
        set(s => ({ settings: { ...s.settings, ...updates } })),
      setTheme: (theme) => {
        set(s => ({ settings: { ...s.settings, theme } }))
        applyTheme(theme)
      },

      /** Migrate plain text credentials to encrypted format */
      migrateCredentials: async () => {
        const servers = get().servers
        let needsUpdate = false
        const migrated: ServerConfig[] = []

        for (const server of servers) {
          const s = { ...server }
          let changed = false

          for (const field of ['password', 'privateKey', 'passphrase'] as const) {
            const value = s[field]
            if (value && !value.startsWith(ENC_PREFIX)) {
              s[field] = (await encryptField(value)) ?? value
              changed = true
            }
          }

          migrated.push(s as ServerConfig)
          if (changed) needsUpdate = true
        }

        if (needsUpdate) {
          set({ servers: migrated })
        }
      },
    }),
    {
      name: 'xxterm-storage',
      partialize: (state) => ({
        servers: state.servers,
        settings: state.settings,
        sidebarWidth: state.sidebarWidth,
      }),
    }
  )
)

export function applyTheme(themeId: ThemeId) {
  const theme = themes[themeId]
  if (!theme) return
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
}
