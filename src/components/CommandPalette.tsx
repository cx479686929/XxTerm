import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { builtinCommandGroups, toFavorite } from '../data/builtinCommands'
import type { FavoriteCommand } from '../types'
import { useToast } from '../hooks/useToast'
import { useI18n } from '../i18n'

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
  const { t } = useI18n()

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
        translatedCategory: g.categoryKey ? t(g.categoryKey) : `${g.icon} ${g.category}`,
        commands: g.commands.filter(c =>
          c.command.toLowerCase().includes(q) ||
          (c.descKey ? t(c.descKey) : c.desc).toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.commands.length > 0)
  }, [search, t])

  // Flat builtin list for navigation
  const flatBuiltin = useMemo(() => {
    const items: { command: string; desc: string; descKey?: string; category: string; categoryKey?: string; icon: string }[] = []
    for (const g of filteredBuiltin) {
      for (const c of g.commands) {
        items.push({ ...c, category: g.category, categoryKey: g.categoryKey, icon: g.icon })
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
      toast('warning', t('commandPalette.warning.noTerminal'))
      return
    }
    const isLocal = activeTab.type === 'local'
    if (isLocal) {
      window.electron?.localWrite({ id: activeTab.id, data: command + '\n' })
    } else {
      window.electron?.sshWrite({ id: activeTab.id, data: command + '\n' })
    }
    setShowCommandPalette(false)
    toast('success', t('commandPalette.success.executed', { command: command.length > 40 ? command.slice(0, 40) + '...' : command }))
  }, [activeTab, toast, setShowCommandPalette])

  // Copy command to clipboard and paste into terminal
  const copyAndPaste = useCallback((command: string) => {
    if (!activeTab) {
      toast('warning', t('commandPalette.warning.noTerminal'))
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
  const addBuiltinToFavorites = useCallback((cmd: { command: string; desc: string; descKey?: string }, category: string, categoryKey: string | undefined, icon: string) => {
    const fav = toFavorite(cmd, category, categoryKey, icon, t)
    addFavoriteCommand({ command: fav.command, note: fav.note, category: fav.category, isBuiltin: true })
    toast('success', t('commandPalette.success.favorited', { command: cmd.command }))
  }, [addFavoriteCommand, toast, t])

  // Add custom command
  const handleAddCustom = useCallback(() => {
    const trimmed = addText.trim()
    if (!trimmed) return
    addFavoriteCommand({ command: trimmed, note: '', category: t('commandPalette.category.custom'), isBuiltin: false })
    setAddText('')
    setShowAddForm(false)
    toast('success', t('commandPalette.success.favorited', { command: trimmed }))
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
              {t('commandPalette.tab.favorites')}
            </button>
            <button
              className={`cp-tab ${tab === 'builtin' ? 'active' : ''}`}
              onClick={() => setTab('builtin')}
            >
              {t('commandPalette.tab.builtin')}
            </button>
          </div>
          <button className="cp-close" onClick={() => setShowCommandPalette(false)}>✕</button>
        </div>

        {/* Search */}
        <div className="cp-search-row">
          <input
            ref={inputRef}
            className="cp-search"
            placeholder={tab === 'favorites' ? t('commandPalette.search.favorites') : t('commandPalette.search.builtin')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {tab === 'favorites' && (
            <button
              className="cp-add-btn"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? t('common.cancel') : t('commandPalette.btn.add')}
            </button>
          )}
        </div>

        {/* Add form */}
        {tab === 'favorites' && showAddForm && (
          <div className="cp-add-form">
            <input
              className="cp-input"
              placeholder={t('commandPalette.placeholder.command')}
              value={addText}
              onChange={e => setAddText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCustom() }}
              autoFocus
            />
            <button className="cp-confirm-btn" onClick={handleAddCustom}>{t('commandPalette.btn.favorite')}</button>
          </div>
        )}

        {/* Edit form */}
        {editingId && (
          <div className="cp-edit-form">
            <input
              className="cp-input"
              placeholder={t('commandPalette.placeholder.category')}
              value={editCategory}
              onChange={e => setEditCategory(e.target.value)}
            />
            <input
              className="cp-input"
              placeholder={t('commandPalette.placeholder.note')}
              value={editNote}
              onChange={e => setEditNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(editingId) }}
            />
            <div className="cp-edit-actions">
              <button className="cp-confirm-btn" onClick={() => handleSaveEdit(editingId)}>{t('commandPalette.btn.save')}</button>
              <button className="cp-cancel-btn" onClick={() => setEditingId(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="cp-content" ref={listRef}>
          {tab === 'favorites' ? (
            filteredFavorites.length === 0 ? (
              <div className="cp-empty">
                <div style={{ fontSize: 32 }}>{search ? '🔍' : '⭐'}</div>
                <div>{search ? t('commandPalette.empty.noMatch') : t('commandPalette.empty.noFavorites')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t('commandPalette.empty.hint')}
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
                        data-tooltip={t('common.pasteToTerminal')}
                        onClick={() => copyAndPaste(cmd.command)}
                      >📋</button>
                      <button
                        className="cp-action-btn"
                        data-tooltip={t('commandPalette.tooltip.edit')}
                        onClick={() => {
                          setEditingId(cmd.id)
                          setEditNote(cmd.note)
                          setEditCategory(cmd.category)
                        }}
                      >✏️</button>
                      <button
                        className="cp-action-btn danger"
                        data-tooltip={t('commandPalette.tooltip.deleteFavorite')}
                        onClick={() => {
                          deleteFavoriteCommand(cmd.id)
                          toast('info', t('commandPalette.info.deleted', { command: cmd.command }))
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
                <div>{t('commandPalette.empty.noMatchBuiltin')}</div>
              </div>
            ) : (
              <div className="cp-list">
                {filteredBuiltin.map(group => (
                  <div key={group.category}>
                    <div className="cp-group-header">
                      {group.icon} {group.translatedCategory}
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
                            <span className="cp-item-desc">{cmd.descKey ? t(cmd.descKey) : cmd.desc}</span>
                          </div>
                          <div className="cp-item-actions" onClick={e => e.stopPropagation()}>
                            <button
                              className="cp-action-btn"
                              data-tooltip={t('common.pasteToTerminal')}
                              onClick={() => copyAndPaste(cmd.command)}
                            >📋</button>
                            <button
                              className={`cp-action-btn ${isFav ? 'active' : ''}`}
                              data-tooltip={isFav ? t('commandPalette.tooltip.favorited') : t('commandPalette.tooltip.favoriteThis')}
                              onClick={() => addBuiltinToFavorites(cmd, group.category, group.categoryKey, group.icon)}
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
          <span>{t('commandPalette.hint.navigate')}</span>
          <span>{t('commandPalette.hint.execute')}</span>
          <span>{t('commandPalette.hint.close')}</span>
          <span>{t('commandPalette.hint.open')}</span>
        </div>
      </div>
    </div>
  )
}
