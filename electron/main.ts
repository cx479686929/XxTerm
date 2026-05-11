import { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } from 'electron'
import { join } from 'path'
import { Client } from 'ssh2'
import * as fs from 'fs'
import * as os from 'os'
import * as pty from 'node-pty'
import { execSync } from 'child_process'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const iconPath = isDev ? join(__dirname, '../build/icon.icns') : join(process.resourcesPath, 'icon.icns')

let mainWindow: BrowserWindow | null = null

// ─── Shell PATH Detection ─────────────────────────────────────────────────────
// macOS GUI apps (launched from Finder) don't inherit ~/.zshrc PATH.
// We cache the login-shell PATH so every PTY gets the correct environment.
let cachedLoginPath: string | null = null

function detectUserPath(): string {
  if (cachedLoginPath) return cachedLoginPath

  const shell = process.env.SHELL || '/bin/zsh'

  // Try to get PATH from a login shell (sources /etc/profile, ~/.profile, etc.)
  try {
    const path = execSync(`${shell} -l -c 'printf %s "$PATH"'`, {
      encoding: 'utf8',
      // Minimal env so the login shell builds its own PATH from config files
      env: {
        HOME: os.homedir(),
        SHELL: shell,
        TERM: 'xterm-256color',
        USER: process.env.USER || '',
      },
      timeout: 5000,
    }).trim()

    if (path && path.length > 10 && path.includes('/')) {
      cachedLoginPath = path
      return path
    }
  } catch {
    // Login shell approach failed — fall through
  }

  // Fallback: build a comprehensive PATH covering common install locations
  const fallbacks = [
    '/opt/homebrew/bin',    // Apple Silicon Homebrew
    '/opt/homebrew/sbin',
    '/usr/local/bin',        // Intel Homebrew / user-installed
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    join(os.homedir(), 'bin'),
    join(os.homedir(), '.local/bin'),
  ]

  cachedLoginPath = fallbacks.join(':')
  return cachedLoginPath
}

// SSH connections map
const sshConnections = new Map<string, Client>()
const sshStreams = new Map<string, any>()
const sftpSessions = new Map<string, any>()
const localPtyMap = new Map<string, pty.IPty>()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0d0f',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
    vibrancy: 'under-window',
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── Window Controls ─────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

// ─── SSH Connect ──────────────────────────────────────────────────────────────
ipcMain.handle('ssh:connect', async (event, config: {
  id: string
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
}) => {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    
    const connConfig: any = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      readyTimeout: 10000,
    }
    
    if (config.privateKey) {
      connConfig.privateKey = config.privateKey
      if (config.passphrase) connConfig.passphrase = config.passphrase
    } else if (config.password) {
      connConfig.password = config.password
    }

    conn.on('ready', () => {
      sshConnections.set(config.id, conn)
      resolve({ success: true })
    })

    conn.on('error', (err) => {
      reject({ success: false, error: err.message })
    })

    conn.connect(connConfig)
  })
})

// ─── SSH Shell ────────────────────────────────────────────────────────────────
ipcMain.handle('ssh:shell', async (event, { id, cols, rows }: { id: string, cols: number, rows: number }) => {
  return new Promise((resolve, reject) => {
    const conn = sshConnections.get(id)
    if (!conn) return reject(new Error('Not connected'))

    conn.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
      if (err) return reject(err)
      
      sshStreams.set(id, stream)

      stream.on('data', (data: Buffer) => {
        mainWindow?.webContents.send(`ssh:data:${id}`, data.toString('utf8'))
      })

      stream.stderr.on('data', (data: Buffer) => {
        mainWindow?.webContents.send(`ssh:data:${id}`, data.toString('utf8'))
      })

      stream.on('close', () => {
        mainWindow?.webContents.send(`ssh:close:${id}`)
        sshStreams.delete(id)
      })

      resolve({ success: true })
    })
  })
})

ipcMain.on('ssh:write', (event, { id, data }: { id: string, data: string }) => {
  const stream = sshStreams.get(id)
  if (stream) stream.write(data)
})

ipcMain.on('ssh:resize', (event, { id, cols, rows }: { id: string, cols: number, rows: number }) => {
  const stream = sshStreams.get(id)
  if (stream) stream.setWindow(rows, cols, 0, 0)
})

// ─── SSH Exec (run command and return output) ──────────────────────────────────
ipcMain.handle('ssh:exec', async (event, { id, command }: { id: string, command: string }) => {
  return new Promise((resolve, reject) => {
    const conn = sshConnections.get(id)
    if (!conn) return reject(new Error('Not connected'))

    conn.exec(command, (err, stream) => {
      if (err) return reject(err)

      let stdout = ''
      let stderr = ''

      stream.on('data', (data: Buffer) => { stdout += data.toString('utf8') })
      stream.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf8') })
      stream.on('close', () => {
        resolve({ stdout, stderr, code: stream.exitCode })
      })
    })
  })
})

// ─── SSH Disconnect ───────────────────────────────────────────────────────────
ipcMain.on('ssh:disconnect', (event, id: string) => {
  const stream = sshStreams.get(id)
  if (stream) { stream.close(); sshStreams.delete(id) }
  const conn = sshConnections.get(id)
  if (conn) { conn.end(); sshConnections.delete(id) }
  const sftp = sftpSessions.get(id)
  if (sftp) sftpSessions.delete(id)
})

// ─── Local PTY Shell ─────────────────────────────────────────────────────────
ipcMain.handle('local:shell', async (event, { id, cols, rows, shell: userShell }: { id: string, cols: number, rows: number, shell?: string }) => {
  const defaultShell = userShell || process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh')

  // Build env for the PTY — use the login-shell PATH so commands like npm are found
  const ptyEnv: Record<string, string> = { ...process.env as Record<string, string> }
  ptyEnv.PATH = detectUserPath()
  if (!ptyEnv.HOME) {
    ptyEnv.HOME = process.env.HOME || os.homedir()
  }
  if (!ptyEnv.TERM) {
    ptyEnv.TERM = 'xterm-256color'
  }

  // Spawn as interactive shell so it sources ~/.zshrc / ~/.bashrc
  // This gives the user their full custom PATH and aliases
  const shellArgs = process.platform === 'win32' ? [] : ['-i']

  const ptyProcess = pty.spawn(defaultShell, shellArgs, {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: ptyEnv.HOME,
    env: ptyEnv,
  })

  localPtyMap.set(id, ptyProcess)

  ptyProcess.onData((data: string) => {
    mainWindow?.webContents.send(`local:data:${id}`, data)
  })

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    mainWindow?.webContents.send(`local:close:${id}`)
    localPtyMap.delete(id)
  })

  return { success: true }
})

ipcMain.on('local:write', (event, { id, data }: { id: string, data: string }) => {
  const ptyProcess = localPtyMap.get(id)
  if (ptyProcess) ptyProcess.write(data)
})

ipcMain.on('local:resize', (event, { id, cols, rows }: { id: string, cols: number, rows: number }) => {
  const ptyProcess = localPtyMap.get(id)
  if (ptyProcess) {
    try { ptyProcess.resize(cols, rows) } catch {}
  }
})

ipcMain.on('local:disconnect', (event, id: string) => {
  const ptyProcess = localPtyMap.get(id)
  if (ptyProcess) {
    ptyProcess.kill()
    localPtyMap.delete(id)
  }
})

// ─── Credential Encryption (safeStorage → macOS Keychain) ────────────────
const ENC_PREFIX = 'enc:v1:'

ipcMain.handle('credentials:encrypt', async (_event, plaintext: string) => {
  if (!plaintext) return ''
  if (!safeStorage.isEncryptionAvailable()) return ENC_PREFIX + Buffer.from(plaintext).toString('base64')
  const encrypted = safeStorage.encryptString(plaintext)
  return ENC_PREFIX + encrypted.toString('base64')
})

ipcMain.handle('credentials:decrypt', async (_event, ciphertext: string) => {
  if (!ciphertext) return ''
  if (!ciphertext.startsWith(ENC_PREFIX)) return ciphertext
  const raw = ciphertext.slice(ENC_PREFIX.length)
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(raw, 'base64').toString('utf8')
  try {
    let result = safeStorage.decryptString(Buffer.from(raw, 'base64'))
    // Handle double-encryption: if result is still encrypted, decrypt again
    if (result.startsWith(ENC_PREFIX)) {
      const raw2 = result.slice(ENC_PREFIX.length)
      result = safeStorage.decryptString(Buffer.from(raw2, 'base64'))
    }
    return result
  } catch {
    // Fallback: maybe it's a plain base64 from the fallback encrypt
    return Buffer.from(raw, 'base64').toString('utf8')
  }
})

ipcMain.handle('credentials:isEncrypted', async (_event, value: string) => {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX)
})

// ─── SFTP ─────────────────────────────────────────────────────────────────────
ipcMain.handle('sftp:list', async (event, { id, path }: { id: string, path: string }) => {
  return new Promise((resolve, reject) => {
    const conn = sshConnections.get(id)
    if (!conn) return reject(new Error('Not connected'))

    const doList = (sftp: any) => {
      sftp.readdir(path, (err: any, list: any[]) => {
        if (err) return reject(err)
        const files = list.map(item => ({
          name: item.filename,
          path: `${path}/${item.filename}`.replace(/\/\//g, '/'),
          isDirectory: item.attrs.isDirectory(),
          size: item.attrs.size,
          modified: new Date(item.attrs.mtime * 1000).toISOString(),
          permissions: item.attrs.mode?.toString(8),
        }))
        resolve(files)
      })
    }

    if (sftpSessions.has(id)) {
      doList(sftpSessions.get(id))
    } else {
      conn.sftp((err, sftp) => {
        if (err) return reject(err)
        sftpSessions.set(id, sftp)
        doList(sftp)
      })
    }
  })
})

ipcMain.handle('sftp:readFile', async (event, { id, path }: { id: string, path: string }) => {
  return new Promise((resolve, reject) => {
    const conn = sshConnections.get(id)
    if (!conn) return reject(new Error('Not connected'))

    const doRead = (sftp: any) => {
      sftp.readFile(path, 'utf8', (err: any, data: string) => {
        if (err) return reject(err)
        resolve(data)
      })
    }

    if (sftpSessions.has(id)) {
      doRead(sftpSessions.get(id))
    } else {
      conn.sftp((err, sftp) => {
        if (err) return reject(err)
        sftpSessions.set(id, sftp)
        doRead(sftp)
      })
    }
  })
})

ipcMain.handle('sftp:readFileBuffer', async (event, { id, path }: { id: string, path: string }) => {
  return new Promise((resolve, reject) => {
    const conn = sshConnections.get(id)
    if (!conn) return reject(new Error('Not connected'))

    const doRead = (sftp: any) => {
      sftp.readFile(path, (err: any, data: Buffer) => {
        if (err) return reject(err)
        resolve(data.toString('base64'))
      })
    }

    if (sftpSessions.has(id)) {
      doRead(sftpSessions.get(id))
    } else {
      conn.sftp((err, sftp) => {
        if (err) return reject(err)
        sftpSessions.set(id, sftp)
        doRead(sftp)
      })
    }
  })
})

ipcMain.handle('sftp:writeFile', async (event, { id, path, content }: { id: string, path: string, content: string }) => {
  return new Promise((resolve, reject) => {
    const conn = sshConnections.get(id)
    if (!conn) return reject(new Error('Not connected'))

    const doWrite = (sftp: any) => {
      sftp.writeFile(path, content, (err: any) => {
        if (err) return reject(err)
        resolve({ success: true })
      })
    }

    if (sftpSessions.has(id)) {
      doWrite(sftpSessions.get(id))
    } else {
      conn.sftp((err, sftp) => {
        if (err) return reject(err)
        sftpSessions.set(id, sftp)
        doWrite(sftp)
      })
    }
  })
})

ipcMain.handle('sftp:mkdir', async (event, { id, path }: { id: string, path: string }) => {
  return new Promise((resolve, reject) => {
    const conn = sshConnections.get(id)
    if (!conn) return reject(new Error('Not connected'))
    conn.sftp((err, sftp) => {
      if (err) return reject(err)
      sftp.mkdir(path, (err: any) => {
        if (err) return reject(err)
        resolve({ success: true })
      })
    })
  })
})

ipcMain.handle('sftp:delete', async (event, { id, path, isDir }: { id: string, path: string, isDir: boolean }) => {
  return new Promise((resolve, reject) => {
    const conn = sshConnections.get(id)
    if (!conn) return reject(new Error('Not connected'))
    conn.sftp((err, sftp) => {
      if (err) return reject(err)
      const op = isDir ? sftp.rmdir.bind(sftp) : sftp.unlink.bind(sftp)
      op(path, (err: any) => {
        if (err) return reject(err)
        resolve({ success: true })
      })
    })
  })
})

// ─── SFTP Upload/Download ─────────────────────────────────────────────────
ipcMain.handle('sftp:upload', async (event, { id, localPath, remotePath }: { id: string, localPath: string, remotePath: string }) => {
  return new Promise((resolve, reject) => {
    const conn = sshConnections.get(id)
    if (!conn) return reject(new Error('Not connected'))

    const doUpload = (sftp: any) => {
      sftp.fastPut(localPath, remotePath, (err: any) => {
        if (err) return reject(err)
        resolve({ success: true })
      })
    }

    if (sftpSessions.has(id)) {
      doUpload(sftpSessions.get(id))
    } else {
      conn.sftp((err, sftp) => {
        if (err) return reject(err)
        sftpSessions.set(id, sftp)
        doUpload(sftp)
      })
    }
  })
})

ipcMain.handle('sftp:download', async (event, { id, remotePath, localPath }: { id: string, remotePath: string, localPath: string }) => {
  return new Promise((resolve, reject) => {
    const conn = sshConnections.get(id)
    if (!conn) return reject(new Error('Not connected'))

    const doDownload = (sftp: any) => {
      sftp.fastGet(remotePath, localPath, (err: any) => {
        if (err) return reject(err)
        resolve({ success: true })
      })
    }

    if (sftpSessions.has(id)) {
      doDownload(sftpSessions.get(id))
    } else {
      conn.sftp((err, sftp) => {
        if (err) return reject(err)
        sftpSessions.set(id, sftp)
        doDownload(sftp)
      })
    }
  })
})

// ─── File Dialogs ────────────────────────────────────────────────────────────
ipcMain.handle('dialog:openFile', async (event, options?: any) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    ...options,
  })
  return result
})

ipcMain.handle('dialog:saveFile', async (event, options?: any) => {
  const result = await dialog.showSaveDialog(mainWindow!, options)
  return result
})

// ─── App Info ─────────────────────────────────────────────────────────────────
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('app:platform', () => process.platform)
