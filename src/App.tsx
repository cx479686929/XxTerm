import { useEffect } from 'react'
import { useAppStore, applyTheme } from './stores/appStore'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import MainArea from './components/MainArea'
import AddServerModal from './components/AddServerModal'
import SettingsModal from './components/SettingsModal'
import SystemMonitor from './components/SystemMonitor'
import ToastContainer from './components/ToastContainer'

export default function App() {
  const { settings, monitorTab, migrateCredentials } = useAppStore()

  useEffect(() => {
    applyTheme(settings.theme)
    // Migrate plain text credentials to encrypted storage
    migrateCredentials()
  }, [])

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
      <ToastContainer />
    </div>
  )
}
