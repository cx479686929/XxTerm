import { useState, useEffect, useCallback, useRef } from 'react'
import type { FileItem } from '../types'
import { useAppStore } from '../stores/appStore'
import { formatFileSize, formatDate, getFileIcon } from '../utils/helpers'
import { useToast } from '../hooks/useToast'

interface TransferProgress {
  type: 'upload' | 'download'
  fileName: string
  transferred: number
  total: number
  percent: number
}

interface Props {
  tabId: string
}

export default function FileManager({ tabId }: Props) {
  const { setShowFileManager, tabs } = useAppStore()
  const { toast } = useToast()
  const tab = tabs.find(t => t.id === tabId)
  const isConnected = tab?.status === 'connected'
  const isLocal = tab?.type === 'local'
  const [path, setPath] = useState('/')
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [pathHistory, setPathHistory] = useState<string[]>(['/'])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileItem } | null>(null)
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null)
  const [previewImage, setPreviewImage] = useState<{ path: string; dataUrl: string } | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [transfer, setTransfer] = useState<TransferProgress | null>(null)

  const loadDir = useCallback(async (p: string) => {
    setLoading(true)
    setSelected(null)
    try {
      const result = await window.electron?.sftpList({ id: tabId, path: p })
      if (result) {
        const sorted = [...result].sort((a: FileItem, b: FileItem) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
        setFiles(sorted)
        setPath(p)
      }
    } catch (err: any) {
      toast('error', `加载目录失败: ${err?.message ?? err}`)
    } finally {
      setLoading(false)
    }
  }, [tabId, toast])

  // Sync with current terminal working directory
  const syncCwd = useCallback(async () => {
    if (!isConnected || isLocal) return
    try {
      const cwd = await window.electron?.sftpGetCwd({ id: tabId })
      if (cwd) {
        setPathHistory([cwd])
        loadDir(cwd)
      }
    } catch { /* ignore */ }
  }, [isConnected, isLocal, tabId, loadDir])

  // Load directory once connection is established
  const loadedRef = useRef(false)
  useEffect(() => {
    if (isConnected && !isLocal && !loadedRef.current) {
      loadedRef.current = true
      syncCwd()
    }
    // Reset when tab changes
    if (tabId) {
      loadedRef.current = false
    }
  }, [isConnected, isLocal, tabId])

  const navigate = (p: string) => {
    setPathHistory(h => [...h, p])
    loadDir(p)
  }

  const goBack = () => {
    if (pathHistory.length <= 1) return
    const newHistory = pathHistory.slice(0, -1)
    setPathHistory(newHistory)
    loadDir(newHistory[newHistory.length - 1])
  }

  const breadcrumbs = path.split('/').filter(Boolean)

  const handleFileClick = (file: FileItem) => {
    if (file.isDirectory) {
      navigate(file.path)
    } else {
      setSelected(file.path)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, file })
  }

  useEffect(() => {
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif', 'avif'])

  const openFile = async (file: FileItem) => {
    if (!isConnected) {
      toast('warning', 'SSH 连接尚未建立')
      return
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (IMAGE_EXTS.has(ext)) {
      try {
        const base64 = await window.electron?.sftpReadFileBuffer({ id: tabId, path: file.path })
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
        setPreviewImage({ path: file.path, dataUrl: `data:${mime};base64,${base64}` })
      } catch (err: any) {
        toast('error', `无法预览图片: ${err?.message ?? err}`)
      }
    } else {
      try {
        const content = await window.electron?.sftpReadFile({ id: tabId, path: file.path })
        setEditingFile({ path: file.path, content })
      } catch (err: any) {
        toast('error', `无法读取文件: ${err?.message ?? err}`)
      }
    }
  }

  const saveFile = async () => {
    if (!editingFile) return
    try {
      await window.electron?.sftpWriteFile({ id: tabId, path: editingFile.path, content: editingFile.content })
      toast('success', '文件已保存')
      setEditingFile(null)
    } catch (err: any) {
      toast('error', `保存失败: ${err?.message ?? err}`)
    }
  }

  const deleteFile = async (file: FileItem) => {
    if (!confirm(`确定要删除 "${file.name}" 吗？`)) return
    try {
      await window.electron?.sftpDelete({ id: tabId, path: file.path, isDir: file.isDirectory })
      toast('success', `已删除 ${file.name}`)
      loadDir(path)
    } catch (err: any) {
      toast('error', `删除失败: ${err?.message ?? err}`)
    }
  }

  const createFolder = async () => {
    if (!newFolderName.trim()) return
    const newPath = `${path}/${newFolderName}`.replace(/\/\//g, '/')
    try {
      await window.electron?.sftpMkdir({ id: tabId, path: newPath })
      toast('success', `文件夹 "${newFolderName}" 已创建`)
      setNewFolderName('')
      setShowNewFolder(false)
      loadDir(path)
    } catch (err: any) {
      toast('error', `创建失败: ${err?.message ?? err}`)
    }
  }

  // Listen for transfer progress
  useEffect(() => {
    if (!window.electron?.onTransferProgress) return
    const unsubscribe = window.electron.onTransferProgress((info) => {
      if (info.id !== tabId) return
      setTransfer({
        type: info.type as 'upload' | 'download',
        fileName: info.fileName,
        transferred: info.transferred,
        total: info.total,
        percent: info.percent,
      })
      if (info.percent >= 100) {
        setTimeout(() => setTransfer(null), 1500)
      }
    })
    return () => unsubscribe()
  }, [tabId])

  const uploadFile = async () => {
    if (!isConnected) {
      toast('warning', 'SSH 连接尚未建立')
      return
    }
    try {
      const result = await window.electron?.showOpenDialog({
        title: '选择要上传的文件',
        properties: ['openFile'],
      })
      if (result?.canceled || !result?.filePaths?.length) return
      const localPath = result.filePaths[0]
      const fileName = localPath.split('/').pop()
      const remotePath = `${path}/${fileName}`.replace(/\/\//g, '/')
      setTransfer({ type: 'upload', fileName: fileName ?? '', transferred: 0, total: 0, percent: 0 })
      await window.electron?.sftpUpload({ id: tabId, localPath, remotePath })
      toast('success', `文件 "${fileName}" 上传成功`)
      loadDir(path)
    } catch (err: any) {
      setTransfer(null)
      toast('error', `上传失败: ${err?.message ?? err}`)
    }
  }

  const downloadFile = async (file: FileItem) => {
    if (!isConnected) {
      toast('warning', 'SSH 连接尚未建立')
      return
    }
    try {
      const result = await window.electron?.showSaveDialog({
        title: '选择保存位置',
        defaultPath: file.name,
      })
      if (result?.canceled || !result?.filePath) return
      const localPath = result.filePath
      setTransfer({ type: 'download', fileName: file.name, transferred: 0, total: file.size, percent: 0 })
      await window.electron?.sftpDownload({ id: tabId, remotePath: file.path, localPath })
      toast('success', `文件 "${file.name}" 下载成功`)
    } catch (err: any) {
      setTransfer(null)
      toast('error', `下载失败: ${err?.message ?? err}`)
    }
  }

  return (
    <>
      <div
        className="file-manager"
        style={{ width: 300 }}
      >
        <div className="file-manager-header">
          <div className="file-manager-title">
            <span>文件管理器</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className="icon-btn"
                onClick={uploadFile}
                data-tooltip="上传文件"
                data-tooltip-below
              >⬆️</button>
              <button
                className="icon-btn"
                onClick={() => loadDir(path)}
                data-tooltip="刷新"
                data-tooltip-below
              >🔄</button>
              {!isLocal && (
                <button
                  className="icon-btn"
                  onClick={syncCwd}
                  data-tooltip="同步终端路径"
                  data-tooltip-below
                >🔗</button>
              )}
              <button
                className="icon-btn"
                onClick={() => setShowNewFolder(true)}
                data-tooltip="新建文件夹"
                data-tooltip-below
              >📁+</button>
              <button
                className="icon-btn"
                onClick={() => setShowFileManager(false)}
                data-tooltip="关闭"
                data-tooltip-below
              >✕</button>
            </div>
          </div>

          {/* Breadcrumb */}
          <div className="breadcrumb">
            <span
              className="breadcrumb-item"
              onClick={() => navigate('/')}
            >/</span>
            {breadcrumbs.map((seg, i) => {
              const segPath = '/' + breadcrumbs.slice(0, i + 1).join('/')
              return (
                <span key={segPath} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <span className="breadcrumb-sep">›</span>
                  <span
                    className={`breadcrumb-item ${i === breadcrumbs.length - 1 ? 'active' : ''}`}
                    onClick={() => navigate(segPath)}
                  >{seg}</span>
                </span>
              )
            })}
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={goBack}
              disabled={pathHistory.length <= 1}
            >← 返回</button>
          </div>
        </div>

        {showNewFolder && (
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="form-input"
                placeholder="文件夹名称"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createFolder()}
                autoFocus
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary btn-sm" onClick={createFolder}>创建</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowNewFolder(false); setNewFolderName('') }}>取消</button>
            </div>
          </div>
        )}

        {/* Transfer Progress */}
        {transfer && (
          <div className="transfer-progress">
            <div className="transfer-progress-info">
              <span>{transfer.type === 'upload' ? '⬆️' : '⬇️'} {transfer.fileName}</span>
              <span>{formatFileSize(transfer.transferred)} / {formatFileSize(transfer.total)} · {transfer.percent}%</span>
            </div>
            <div className="transfer-progress-bar">
              <div className="transfer-progress-fill" style={{ width: `${transfer.percent}%` }} />
            </div>
          </div>
        )}

        <div className="file-list">
          {isLocal ? (
            <div className="empty-state">
              <div className="empty-state-icon">💻</div>
              <div className="empty-state-text">当前为本地终端<br />请切换到 SSH 标签页使用文件管理</div>
            </div>
          ) : !isConnected ? (
            <div className="empty-state">
              <div className="empty-state-icon">⏳</div>
              <div className="empty-state-text">等待 SSH 连接建立...</div>
            </div>
          ) : loading ? (
            <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
              <div className="spinner" />
            </div>
          ) : files.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-text">目录为空</div>
            </div>
          ) : (
            files.map(file => (
              <div
                key={file.path}
                className={`file-item ${selected === file.path ? 'selected' : ''}`}
                onClick={() => handleFileClick(file)}
                onContextMenu={e => handleContextMenu(e, file)}
                onDoubleClick={() => !file.isDirectory && openFile(file)}
              >
                <span className="file-icon">{getFileIcon(file.name, file.isDirectory)}</span>
                <div className="file-info">
                  <div className="file-name">{file.name}</div>
                  <div className="file-meta">
                    {file.isDirectory ? '目录' : formatFileSize(file.size)} · {formatDate(file.modified)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {!contextMenu.file.isDirectory && (
            <div className="context-menu-item" onClick={() => {
              openFile(contextMenu.file)
              setContextMenu(null)
            }}>
              📝 编辑
            </div>
          )}
          {!contextMenu.file.isDirectory && (
            <div className="context-menu-item" onClick={() => {
              downloadFile(contextMenu.file)
              setContextMenu(null)
            }}>
              ⬇️ 下载
            </div>
          )}
          {contextMenu.file.isDirectory && (
            <div className="context-menu-item" onClick={() => {
              navigate(contextMenu.file.path)
              setContextMenu(null)
            }}>
              📂 打开
            </div>
          )}
          <div className="context-menu-sep" />
          <div className="context-menu-item danger" onClick={() => {
            deleteFile(contextMenu.file)
            setContextMenu(null)
          }}>
            🗑️ 删除
          </div>
        </div>
      )}

      {/* File Editor Modal */}
      {editingFile && (
        <div className="modal-overlay" onClick={() => setEditingFile(null)}>
          <div
            className="modal-box"
            style={{ width: 700 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <span className="modal-title">📝 {editingFile.path.split('/').pop()}</span>
              <button className="icon-btn" onClick={() => setEditingFile(null)}>✕</button>
            </div>
            <div className="modal-body">
              <textarea
                className="form-input form-textarea"
                value={editingFile.content}
                onChange={e => setEditingFile({ ...editingFile, content: e.target.value })}
                style={{ minHeight: 400, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingFile(null)}>取消</button>
              <button className="btn btn-primary" onClick={saveFile}>💾 保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="modal-overlay" onClick={() => setPreviewImage(null)}>
          <div
            className="modal-box"
            style={{ width: 700 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <span className="modal-title">🖼️ {previewImage.path.split('/').pop()}</span>
              <button className="icon-btn" onClick={() => setPreviewImage(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
              <img
                src={previewImage.dataUrl}
                alt={previewImage.path.split('/').pop()}
                style={{ maxWidth: '100%', maxHeight: 500, objectFit: 'contain', borderRadius: 6 }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
