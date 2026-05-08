// Types for XxTerm application

export interface ServerConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
  tags?: string[]
  lastConnected?: string
  color?: string
  icon?: string
  group?: string
}

export interface TabItem {
  id: string
  serverId: string
  serverName: string
  serverHost: string
  type: 'terminal' | 'sftp' | 'local'
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  title: string
  color?: string
}

export interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modified: string
  permissions?: string
}

export type ThemeId = 'midnight' | 'aurora' | 'ocean' | 'sakura' | 'matrix' | 'light'

export interface Theme {
  id: ThemeId
  name: string
  description: string
  preview: string[]
  vars: Record<string, string>
  terminal: {
    background: string
    foreground: string
    cursor: string
    cursorAccent?: string
    selectionBackground?: string
    black: string
    red: string
    green: string
    yellow: string
    blue: string
    magenta: string
    cyan: string
    white: string
    brightBlack: string
    brightRed: string
    brightGreen: string
    brightYellow: string
    brightBlue: string
    brightMagenta: string
    brightCyan: string
    brightWhite: string
  }
}

export interface AppSettings {
  fontSize: number
  fontFamily: string
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  scrollback: number
  theme: ThemeId
  language: 'zh' | 'en'
}
