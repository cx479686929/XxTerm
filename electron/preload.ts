import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // SSH
  sshConnect: (config: any) => ipcRenderer.invoke('ssh:connect', config),
  sshShell: (params: any) => ipcRenderer.invoke('ssh:shell', params),
  sshWrite: (params: any) => ipcRenderer.send('ssh:write', params),
  sshResize: (params: any) => ipcRenderer.send('ssh:resize', params),
  sshDisconnect: (id: string) => ipcRenderer.send('ssh:disconnect', id),
  sshExec: (params: any) => ipcRenderer.invoke('ssh:exec', params),
  onSshData: (id: string, cb: (data: string) => void) => {
    const handler = (_: any, data: string) => cb(data)
    ipcRenderer.on(`ssh:data:${id}`, handler)
    return () => ipcRenderer.removeListener(`ssh:data:${id}`, handler)
  },
  onSshClose: (id: string, cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on(`ssh:close:${id}`, handler)
    return () => ipcRenderer.removeListener(`ssh:close:${id}`, handler)
  },

  // SFTP
  sftpList: (params: any) => ipcRenderer.invoke('sftp:list', params),
  sftpReadFile: (params: any) => ipcRenderer.invoke('sftp:readFile', params),
  sftpReadFileBuffer: (params: any) => ipcRenderer.invoke('sftp:readFileBuffer', params),
  sftpWriteFile: (params: any) => ipcRenderer.invoke('sftp:writeFile', params),
  sftpMkdir: (params: any) => ipcRenderer.invoke('sftp:mkdir', params),
  sftpDelete: (params: any) => ipcRenderer.invoke('sftp:delete', params),
  sftpUpload: (params: any) => ipcRenderer.invoke('sftp:upload', params),
  sftpDownload: (params: any) => ipcRenderer.invoke('sftp:download', params),

  // Dialogs
  showOpenDialog: (options?: any) => ipcRenderer.invoke('dialog:openFile', options),
  showSaveDialog: (options?: any) => ipcRenderer.invoke('dialog:saveFile', options),

  // App
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),

  // Local PTY
  localShell: (params: any) => ipcRenderer.invoke('local:shell', params),
  localWrite: (params: any) => ipcRenderer.send('local:write', params),
  localResize: (params: any) => ipcRenderer.send('local:resize', params),
  localDisconnect: (id: string) => ipcRenderer.send('local:disconnect', id),
  onLocalData: (id: string, cb: (data: string) => void) => {
    const handler = (_: any, data: string) => cb(data)
    ipcRenderer.on(`local:data:${id}`, handler)
    return () => ipcRenderer.removeListener(`local:data:${id}`, handler)
  },
  onLocalClose: (id: string, cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on(`local:close:${id}`, handler)
    return () => ipcRenderer.removeListener(`local:close:${id}`, handler)
  },
  // Transfer progress
  onTransferProgress: (cb: (info: { id: string; type: string; fileName: string; transferred: number; total: number; percent: number }) => void) => {
    const handler = (_: any, info: any) => cb(info)
    ipcRenderer.on('transfer:progress', handler)
    return () => ipcRenderer.removeListener('transfer:progress', handler)
  },

  // Credentials
  credentialsEncrypt: (plaintext: string) => ipcRenderer.invoke('credentials:encrypt', plaintext),
  credentialsDecrypt: (ciphertext: string) => ipcRenderer.invoke('credentials:decrypt', ciphertext),
  credentialsIsEncrypted: (value: string) => ipcRenderer.invoke('credentials:isEncrypted', value),
})
