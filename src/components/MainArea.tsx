import { useAppStore } from '../stores/appStore'
import TabBar from './TabBar'
import TerminalPane from './TerminalPane'
import FileManager from './FileManager'
import WelcomeScreen from './WelcomeScreen'

export default function MainArea() {
  const { tabs, activeTabId, showFileManager } = useAppStore()

  if (tabs.length === 0) {
    return (
      <div className="main-area">
        <WelcomeScreen />
      </div>
    )
  }

  return (
    <div className="main-area">
      <TabBar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div className="terminal-container">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className="terminal-pane"
              style={{
                display: tab.id === activeTabId ? 'flex' : 'none',
                width: '100%',
                height: '100%',
              }}
            >
              <TerminalPane tab={tab} />
            </div>
          ))}
        </div>
        {showFileManager && activeTabId && (
          <FileManager
            tabId={
              tabs.find(t => t.id === activeTabId && t.type === 'sftp')
                ? activeTabId
                : tabs.find(t => t.type === 'sftp')?.id ?? activeTabId
            }
          />
        )}
      </div>
    </div>
  )
}
