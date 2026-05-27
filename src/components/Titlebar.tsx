import { useAppStore } from '../stores/appStore'

export default function Titlebar() {
  const { tabs, activeTabId, setShowSettings } = useAppStore()
  const activeTab = tabs.find(t => t.id === activeTabId)

  return (
    <div className="app-titlebar">
      {/* macOS native traffic lights occupy ~72px on the left under hiddenInset mode */}
      {/* We add a drag region spacer so the window is draggable */}
      <div className="titlebar-drag" />

      <div className="titlebar-center">
        {activeTab ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: activeTab.color ?? '#7c3aed',
                boxShadow: `0 0 6px ${activeTab.color ?? '#7c3aed'}`,
              }}
            />
            {activeTab.serverName} — {activeTab.serverHost}
          </span>
        ) : (
          'XxTerm'
        )}
      </div>

      <div className="titlebar-right">
        <button
          className="icon-btn"
          onClick={() => setShowSettings(true)}
          data-tooltip="设置"
          style={{ fontSize: 13 }}
        >
          ⚙
        </button>
      </div>
    </div>
  )
}

// Extend Window type
declare global {
  interface Window {
    electron?: {
      minimize: () => void
      maximize: () => void
      close: () => void
      sshConnect: (config: any) => Promise<any>
      sshShell: (params: any) => Promise<any>
      sshWrite: (params: any) => void
      sshResize: (params: any) => void
      sshDisconnect: (id: string) => void
      sshExec: (params: any) => Promise<any>
      onSshData: (id: string, cb: (data: string) => void) => () => void
      onSshClose: (id: string, cb: () => void) => () => void
      sftpList: (params: any) => Promise<any>
      sftpReadFile: (params: any) => Promise<any>
      sftpReadFileBuffer: (params: any) => Promise<any>
      sftpWriteFile: (params: any) => Promise<any>
      sftpMkdir: (params: any) => Promise<any>
      sftpDelete: (params: any) => Promise<any>
      sftpUpload: (params: any) => Promise<any>
      sftpDownload: (params: any) => Promise<any>
      sftpGetCwd: (params: any) => Promise<string>
      showOpenDialog: (options?: any) => Promise<any>
      showSaveDialog: (options?: any) => Promise<any>
      getVersion: () => Promise<string>
      getPlatform: () => Promise<string>
      localShell: (params: any) => Promise<any>
      localWrite: (params: any) => void
      localResize: (params: any) => void
      localDisconnect: (id: string) => void
      onLocalData: (id: string, cb: (data: string) => void) => () => void
      onLocalClose: (id: string, cb: () => void) => () => void
      onTransferProgress: (cb: (info: { id: string; type: string; fileName: string; transferred: number; total: number; percent: number }) => void) => () => void
      credentialsEncrypt: (plaintext: string) => Promise<string>
      credentialsDecrypt: (ciphertext: string) => Promise<string>
      credentialsIsEncrypted: (value: string) => Promise<boolean>
    }
  }
}
