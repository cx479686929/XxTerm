export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function formatDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getFileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return '📁'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const icons: Record<string, string> = {
    js: '🟨', ts: '🔷', jsx: '⚛️', tsx: '⚛️',
    py: '🐍', go: '🐹', rs: '🦀', rb: '💎',
    java: '☕', cpp: '⚙️', c: '⚙️', cs: '💜',
    html: '🌐', css: '🎨', scss: '🎨',
    json: '📋', yaml: '📋', yml: '📋', toml: '📋',
    md: '📝', txt: '📄', log: '📜',
    sh: '🖥️', bash: '🖥️', zsh: '🖥️',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
    mp4: '🎬', mov: '🎬', avi: '🎬',
    mp3: '🎵', wav: '🎵', flac: '🎵',
    zip: '📦', tar: '📦', gz: '📦', rar: '📦',
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗',
    env: '🔐', gitignore: '🚫', dockerfile: '🐳',
    xml: '📋', csv: '📊', sql: '🗃️',
  }
  return icons[ext] || '📄'
}

export function getServerColor(host: string): string {
  const colors = [
    '#7c3aed', '#3b82f6', '#10b981', '#f59e0b',
    '#ef4444', '#ec4899', '#06b6d4', '#8b5cf6',
  ]
  let hash = 0
  for (const c of host) hash = (hash * 31 + c.charCodeAt(0)) % colors.length
  return colors[Math.abs(hash)]
}
