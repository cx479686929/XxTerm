import { useEffect } from 'react'
import { useAppStore, applyTheme } from './stores/appStore'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import MainArea from './components/MainArea'
import AddServerModal from './components/AddServerModal'
import SettingsModal from './components/SettingsModal'
import SystemMonitor from './components/SystemMonitor'
import CommandPalette from './components/CommandPalette'
import ToastContainer from './components/ToastContainer'

export default function App() {
  const { settings, monitorTab, migrateCredentials, setShowCommandPalette } = useAppStore()

  useEffect(() => {
    applyTheme(settings.theme)
    // Migrate plain text credentials to encrypted storage
    migrateCredentials()
  }, [])

  // Global keyboard shortcut: Cmd+Shift+C opens Command Palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        setShowCommandPalette(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [setShowCommandPalette])

  return (
    <div className="app-container">
      <Titlebar />
      <div className="app-body">
        <Sidebar />
        <MainArea />
      </div>
      <AddServerModal />
      <SettingsModal />
      {monitorTab && <SystemMonitor tabId={monitorTab.tabId} serverName={monitorTab.serverName} />}
      <CommandPalette />
      <ToastContainer />
    </div>
  )
}
