import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { useI18n } from '../i18n'
import TabBar from './TabBar'
import TerminalPane from './TerminalPane'
import FileManager from './FileManager'
import WelcomeScreen from './WelcomeScreen'

export default function MainArea() {
  const { tabs, activeTabId, showFileManager, updateTab } = useAppStore()
  const { t, locale } = useI18n()

  // When language changes, update local terminal tab titles
  useEffect(() => {
    tabs.forEach(tab => {
      if (tab.type === 'local') {
        const localTitle = t('terminal.localTerminal')
        if (tab.title !== localTitle || tab.serverName !== localTitle) {
          updateTab(tab.id, { title: localTitle, serverName: localTitle })
        }
      }
    })
  }, [locale])

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
          <FileManager tabId={activeTabId} />
        )}
      </div>
    </div>
  )
}
