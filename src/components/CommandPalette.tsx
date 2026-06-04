import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { builtinCommandGroups, toFavorite } from '../data/builtinCommands'
import type { FavoriteCommand } from '../types'
import { useToast } from '../hooks/useToast'

type Tab = 'favorites' | 'builtin'

export default function CommandPalette() {
  const {
    showCommandPalette,
    setShowCommandPalette,
    favoriteCommands,
    addFavoriteCommand,
    updateFavoriteCommand,
    deleteFavoriteCommand,
    tabs,
    activeTabId,
  } = useAppStore()
  const { toast } = useToast()

  const [tab, setTab] = useState<Tab>('favorites')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [addText, setAddText] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [showAddForm, setShowAddForm] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Active tab info for executing commands
  const activeTab = tabs.find(t => t.id === activeTabId)

  // Close on Escape
  useEffect(() => {
    if (!showCommandPalette) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCommandPalette(false)
        setEditingId(null)
        setShowAddForm(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showCommandPalette, setShowCommandPalette])

  // Focus search on open
  useEffect(() => {
    if (showCommandPalette) {
      setSearch('')
      setSelectedIdx(0)
      setEditingId(null)
      setShowAddForm(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [showCommandPalette])

  // Reset selectedIdx when search or tab changes
  useEffect(() => {
    setSelectedIdx(0)
  }, [search, tab])

  // Filtered favorites
  const filteredFavorites = useMemo(() => {
    const q = search.toLowerCase()
    return favoriteCommands.filter(c =>
      c.command.toLowerCase().includes(q) ||
      c.note.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    )
  }, [favoriteCommands, search])

  // Filtered builtin
  const filteredBuiltin = useMemo(() => {
    const q = search.toLowerCase()
    return builtinCommandGroups
      .map(g => ({
        ...g,
        commands: g.commands.filter(c =>
          c.command.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.commands.length > 0)
  }, [search])

  // Flat builtin list for navigation
  const flatBuiltin = useMemo(() => {
    const items: { command: string; desc: string; category: string; icon: string }[] = []
    for (const g of filteredBuiltin) {
      for (const c of g.commands) {
        items.push({ ...c, category: g.category, icon: g.icon })
      }
    }
    return items
  }, [filteredBuiltin])

  const currentItems = tab === 'favorites'
    ? filteredFavorites
    : flatBuiltin

  // Execute command on the active terminal
  const executeCommand = useCallback((command: string) => {
    if (!activeTab) {
      toast('warning', '请先打开一个终端标签页')
      return
    }
    const isLocal = activeTab.type === 'local'
    if (isLocal) {
      window.electron?.localWrite({ id: activeTab.id, data: command + '\n' })
    } else {
      window.electron?.sshWrite({ id: activeTab.id, data: command + '\n' })
    }
    setShowCommandPalette(false)
    toast('success', `已执行: ${command.length > 40 ? command.slice(0, 40) + '...' : command}`)
  }, [activeTab, toast, setShowCommandPalette])

  // Copy command to clipboard and paste into terminal
  const copyAndPaste = useCallback((command: string) => {
    if (!activeTab) {
      toast('warning', '请先打开一个终端标签页')
      return
    }
    const isLocal = activeTab.type === 'local'
    // Write the command text without newline so users can edit before pressing Enter
    if (isLocal) {
      window.electron?.localWrite({ id: activeTab.id, data: command })
    } else {
      window.electron?.sshWrite({ id: activeTab.id, data: command })
    }
    setShowCommandPalette(false)
  }, [activeTab, toast, setShowCommandPalette])

  // Add builtin to favorites
  const addBuiltinToFavorites = useCallback((cmd: { command: string; desc: string }, category: string, icon: string) => {
    const fav = toFavorite(cmd, category, icon)
    addFavoriteCommand({ command: fav.command, note: fav.note, category: fav.category, isBuiltin: true })
    toast('success', `已收藏: ${cmd.command}`)
  }, [addFavoriteCommand, toast])

  // Add custom command
  const handleAddCustom = useCallback(() => {
    const trimmed = addText.trim()
    if (!trimmed) return
    addFavoriteCommand({ command: trimmed, note: '', category: '⭐ 自定义', isBuiltin: false })
    setAddText('')
    setShowAddForm(false)
    toast('success', `已收藏: ${trimmed}`)
  }, [addText, addFavoriteCommand, toast])

  // Save editing
  const handleSaveEdit = useCallback((id: string) => {
    updateFavoriteCommand(id, { note: editNote, category: editCategory })
    setEditingId(null)
  }, [editNote, editCategory, updateFavoriteCommand])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, currentItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = currentItems[selectedIdx]
      if (!item) return
      if (tab === 'favorites') {
        executeCommand((item as FavoriteCommand).command)
      } else {
        executeCommand((item as typeof flatBuiltin[0]).command)
      }
    }
  }, [currentItems, selectedIdx, tab, executeCommand])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  if (!showCommandPalette) return null

  return (
    <div className="modal-overlay" onClick={() => setShowCommandPalette(false)}>
      <div
        className="command-palette"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="cp-header">
          <div className="cp-tabs">
            <button
              className={`cp-tab ${tab === 'favorites' ? 'active' : ''}`}
              onClick={() => setTab('favorites')}
            >
              ⭐ 我的收藏
            </button>
            <button
              className={`cp-tab ${tab === 'builtin' ? 'active' : ''}`}
              onClick={() => setTab('builtin')}
            >
              📚 命令库
            </button>
          </div>
          <button className="cp-close" onClick={() => setShowCommandPalette(false)}>✕</button>
        </div>

        {/* Search */}
        <div className="cp-search-row">
          <input
            ref={inputRef}
            className="cp-search"
            placeholder={tab === 'favorites' ? '搜索收藏的命令...' : '搜索命令库...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {tab === 'favorites' && (
            <button
              className="cp-add-btn"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? '取消' : '＋ 添加'}
            </button>
          )}
        </div>

        {/* Add form */}
        {tab === 'favorites' && showAddForm && (
          <div className="cp-add-form">
            <input
              className="cp-input"
              placeholder="输入要收藏的命令..."
              value={addText}
              onChange={e => setAddText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCustom() }}
              autoFocus
            />
            <button className="cp-confirm-btn" onClick={handleAddCustom}>收藏</button>
          </div>
        )}

        {/* Edit form */}
        {editingId && (
          <div className="cp-edit-form">
            <input
              className="cp-input"
              placeholder="分类（如：⭐ 自定义）"
              value={editCategory}
              onChange={e => setEditCategory(e.target.value)}
            />
            <input
              className="cp-input"
              placeholder="备注说明..."
              value={editNote}
              onChange={e => setEditNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(editingId) }}
            />
            <div className="cp-edit-actions">
              <button className="cp-confirm-btn" onClick={() => handleSaveEdit(editingId)}>保存</button>
              <button className="cp-cancel-btn" onClick={() => setEditingId(null)}>取消</button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="cp-content" ref={listRef}>
          {tab === 'favorites' ? (
            filteredFavorites.length === 0 ? (
              <div className="cp-empty">
                <div style={{ fontSize: 32 }}>{search ? '🔍' : '⭐'}</div>
                <div>{search ? '没有匹配的收藏命令' : '还没有收藏命令'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  点击「＋ 添加」手动收藏，或从命令库一键收藏
                </div>
              </div>
            ) : (
              <div className="cp-list">
                {filteredFavorites.map((cmd, idx) => (
                  <div
                    key={cmd.id}
                    className={`cp-item ${idx === selectedIdx ? 'selected' : ''}`}
                    data-selected={idx === selectedIdx}
                    onClick={() => executeCommand(cmd.command)}
                  >
                    <div className="cp-item-main">
                      <span className="cp-item-badge">{cmd.category}</span>
                      <code className="cp-item-cmd">{cmd.command}</code>
                    </div>
                    {cmd.note && <div className="cp-item-note">{cmd.note}</div>}
                    <div className="cp-item-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className="cp-action-btn"
                        data-tooltip="粘贴到终端"
                        onClick={() => copyAndPaste(cmd.command)}
                      >📋</button>
                      <button
                        className="cp-action-btn"
                        data-tooltip="编辑备注与分类"
                        onClick={() => {
                          setEditingId(cmd.id)
                          setEditNote(cmd.note)
                          setEditCategory(cmd.category)
                        }}
                      >✏️</button>
                      <button
                        className="cp-action-btn danger"
                        data-tooltip="删除收藏"
                        onClick={() => {
                          deleteFavoriteCommand(cmd.id)
                          toast('info', `已删除: ${cmd.command}`)
                        }}
                      >🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            flatBuiltin.length === 0 ? (
              <div className="cp-empty">
                <div style={{ fontSize: 32 }}>🔍</div>
                <div>没有匹配的命令</div>
              </div>
            ) : (
              <div className="cp-list">
                {filteredBuiltin.map(group => (
                  <div key={group.category}>
                    <div className="cp-group-header">
                      {group.icon} {group.category}
                    </div>
                    {group.commands.map((cmd) => {
                      const flatIdx = flatBuiltin.findIndex(
                        f => f.command === cmd.command && f.category === group.category
                      )
                      const isFav = favoriteCommands.some(f => f.command === cmd.command)
                      return (
                        <div
                          key={cmd.command}
                          className={`cp-item ${flatIdx === selectedIdx ? 'selected' : ''}`}
                          data-selected={flatIdx === selectedIdx}
                          onClick={() => executeCommand(cmd.command)}
                        >
                          <div className="cp-item-main">
                            <code className="cp-item-cmd">{cmd.command}</code>
                            <span className="cp-item-desc">{cmd.desc}</span>
                          </div>
                          <div className="cp-item-actions" onClick={e => e.stopPropagation()}>
                            <button
                              className="cp-action-btn"
                              data-tooltip="粘贴到终端"
                              onClick={() => copyAndPaste(cmd.command)}
                            >📋</button>
                            <button
                              className={`cp-action-btn ${isFav ? 'active' : ''}`}
                              data-tooltip={isFav ? '已收藏' : '收藏此命令'}
                              onClick={() => addBuiltinToFavorites(cmd, group.category, group.icon)}
                            >{isFav ? '⭐' : '☆'}</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer hint */}
        <div className="cp-footer">
          <span>↑↓ 导航</span>
          <span>Enter 执行</span>
          <span>Esc 关闭</span>
          <span>⌘⇧C 打开</span>
        </div>
      </div>
    </div>
  )
}
