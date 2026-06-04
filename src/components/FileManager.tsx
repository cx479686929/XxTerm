import { useState, useEffect, useCallback, useRef } from 'react'
import type { FileItem } from '../types'
import { useAppStore } from '../stores/appStore'
import { formatFileSize, formatDate, getFileIcon } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { useI18n } from '../i18n'

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
  const { t } = useI18n()
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
      toast('error', t('fileManager.error.loadDir', { error: err?.message ?? err }))
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
      toast('warning', t('fileManager.error.sshNotConnected'))
      return
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (IMAGE_EXTS.has(ext)) {
      try {
        const base64 = await window.electron?.sftpReadFileBuffer({ id: tabId, path: file.path })
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
        setPreviewImage({ path: file.path, dataUrl: `data:${mime};base64,${base64}` })
      } catch (err: any) {
        toast('error', t('fileManager.error.previewImage', { error: err?.message ?? err }))
      }
    } else {
      try {
        const content = await window.electron?.sftpReadFile({ id: tabId, path: file.path })
        setEditingFile({ path: file.path, content })
      } catch (err: any) {
        toast('error', t('fileManager.error.readFile', { error: err?.message ?? err }))
      }
    }
  }

  const saveFile = async () => {
    if (!editingFile) return
    try {
      await window.electron?.sftpWriteFile({ id: tabId, path: editingFile.path, content: editingFile.content })
      toast('success', t('fileManager.success.saved'))
      setEditingFile(null)
    } catch (err: any) {
      toast('error', t('fileManager.error.saveFailed', { error: err?.message ?? err }))
    }
  }

  const deleteFile = async (file: FileItem) => {
    if (!confirm(t('fileManager.confirm.delete', { name: file.name }))) return
    try {
      await window.electron?.sftpDelete({ id: tabId, path: file.path, isDir: file.isDirectory })
      toast('success', t('fileManager.success.deleted', { name: file.name }))
      loadDir(path)
    } catch (err: any) {
      toast('error', t('fileManager.error.deleteFailed', { error: err?.message ?? err }))
    }
  }

  const createFolder = async () => {
    if (!newFolderName.trim()) return
    const newPath = `${path}/${newFolderName}`.replace(/\/\//g, '/')
    try {
      await window.electron?.sftpMkdir({ id: tabId, path: newPath })
      toast('success', t('fileManager.success.folderCreated', { name: newFolderName }))
      setNewFolderName('')
      setShowNewFolder(false)
      loadDir(path)
    } catch (err: any) {
      toast('error', t('fileManager.error.createFailed', { error: err?.message ?? err }))
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
      toast('warning', t('fileManager.error.sshNotConnected'))
      return
    }
    try {
      const result = await window.electron?.showOpenDialog({
        title: t('fileManager.dialog.openFile'),
        properties: ['openFile'],
      })
      if (result?.canceled || !result?.filePaths?.length) return
      const localPath = result.filePaths[0]
      const fileName = localPath.split('/').pop()
      const remotePath = `${path}/${fileName}`.replace(/\/\//g, '/')
      setTransfer({ type: 'upload', fileName: fileName ?? '', transferred: 0, total: 0, percent: 0 })
      await window.electron?.sftpUpload({ id: tabId, localPath, remotePath })
      toast('success', t('fileManager.success.uploaded', { name: fileName }))
      loadDir(path)
    } catch (err: any) {
      setTransfer(null)
      toast('error', t('fileManager.error.uploadFailed', { error: err?.message ?? err }))
    }
  }

  const downloadFile = async (file: FileItem) => {
    if (!isConnected) {
      toast('warning', t('fileManager.error.sshNotConnected'))
      return
    }
    try {
      const result = await window.electron?.showSaveDialog({
        title: t('fileManager.dialog.saveFile'),
        defaultPath: file.name,
      })
      if (result?.canceled || !result?.filePath) return
      const localPath = result.filePath
      setTransfer({ type: 'download', fileName: file.name, transferred: 0, total: file.size, percent: 0 })
      await window.electron?.sftpDownload({ id: tabId, remotePath: file.path, localPath })
      toast('success', t('fileManager.success.downloaded', { name: file.name }))
    } catch (err: any) {
      setTransfer(null)
      toast('error', t('fileManager.error.downloadFailed', { error: err?.message ?? err }))
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
            <span>{t('fileManager.title')}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className="icon-btn"
                onClick={uploadFile}
                data-tooltip={t('fileManager.tooltip.upload')}
                data-tooltip-below
              >⬆️</button>
              <button
                className="icon-btn"
                onClick={() => loadDir(path)}
                data-tooltip={t('fileManager.tooltip.refresh')}
                data-tooltip-below
              >🔄</button>
              {!isLocal && (
                <button
                  className="icon-btn"
                  onClick={syncCwd}
                  data-tooltip={t('fileManager.tooltip.syncCwd')}
                  data-tooltip-below
                >🔗</button>
              )}
              <button
                className="icon-btn"
                onClick={() => setShowNewFolder(true)}
                data-tooltip={t('fileManager.tooltip.newFolder')}
                data-tooltip-below
              >📁+</button>
              <button
                className="icon-btn"
                onClick={() => setShowFileManager(false)}
                data-tooltip={t('fileManager.tooltip.close')}
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
            >{t('fileManager.btn.back')}</button>
          </div>
        </div>

        {showNewFolder && (
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="form-input"
                placeholder={t('fileManager.placeholder.folderName')}
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createFolder()}
                autoFocus
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary btn-sm" onClick={createFolder}>{t('fileManager.btn.create')}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowNewFolder(false); setNewFolderName('') }}>{t('fileManager.btn.cancel')}</button>
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
              <div className="empty-state-text">{t('fileManager.empty.local').replace('\\n', '\n')}</div>
            </div>
          ) : !isConnected ? (
            <div className="empty-state">
              <div className="empty-state-icon">⏳</div>
              <div className="empty-state-text">{t('fileManager.empty.waiting')}</div>
            </div>
          ) : loading ? (
            <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
              <div className="spinner" />
            </div>
          ) : files.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-text">{t('fileManager.empty.dir')}</div>
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
                    {file.isDirectory ? t('common.directory') : formatFileSize(file.size)} · {formatDate(file.modified)}
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
              {t('fileManager.context.edit')}
            </div>
          )}
          {!contextMenu.file.isDirectory && (
            <div className="context-menu-item" onClick={() => {
              downloadFile(contextMenu.file)
              setContextMenu(null)
            }}>
              {t('fileManager.context.download')}
            </div>
          )}
          {contextMenu.file.isDirectory && (
            <div className="context-menu-item" onClick={() => {
              navigate(contextMenu.file.path)
              setContextMenu(null)
            }}>
              {t('fileManager.context.open')}
            </div>
          )}
          <div className="context-menu-sep" />
          <div className="context-menu-item danger" onClick={() => {
            deleteFile(contextMenu.file)
            setContextMenu(null)
          }}>
            {t('common.delete')}
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
              <button className="btn btn-secondary" onClick={() => setEditingFile(null)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={saveFile}>{t('fileManager.btn.save')}</button>
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
