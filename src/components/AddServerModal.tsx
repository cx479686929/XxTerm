import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import type { ServerConfig } from '../types'
import { getServerColor } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { useI18n } from '../i18n'

const ACCENT_COLORS = [
  '#7c3aed', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#8b5cf6',
  '#14b8a6', '#f97316',
]

export default function AddServerModal() {
  const { showAddServer, setShowAddServer, editServerId, setEditServerId, addServer, updateServer, servers } = useAppStore()
  const { toast } = useToast()
  const { t } = useI18n()
  const [authMode, setAuthMode] = useState<'password' | 'key'>('password')
  const [form, setForm] = useState<Partial<ServerConfig>>({
    name: '',
    host: '',
    port: 22,
    username: 'root',
    password: '',
    privateKey: '',
    passphrase: '',
    color: ACCENT_COLORS[0],
  })
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (editServerId) {
      const server = servers.find(s => s.id === editServerId)
      if (server) {
        setAuthMode(server.privateKey ? 'key' : 'password')
        // Decrypt credentials for editing
        Promise.all([
          server.password ? window.electron?.credentialsDecrypt(server.password) : Promise.resolve(undefined),
          server.privateKey ? window.electron?.credentialsDecrypt(server.privateKey) : Promise.resolve(undefined),
          server.passphrase ? window.electron?.credentialsDecrypt(server.passphrase) : Promise.resolve(undefined),
        ]).then(([password, privateKey, passphrase]) => {
          setForm({ ...server, password, privateKey, passphrase })
        })
      }
    } else {
      setForm({
        name: '',
        host: '',
        port: 22,
        username: 'root',
        password: '',
        privateKey: '',
        passphrase: '',
        color: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)],
      })
    }
  }, [editServerId, showAddServer, servers])

  const handleClose = () => {
    setShowAddServer(false)
    setEditServerId(null)
  }

  const handleSubmit = () => {
    if (!form.host?.trim()) return toast('error', t('server.error.hostRequired'))
    if (!form.username?.trim()) return toast('error', t('server.error.usernameRequired'))
    if (!form.name?.trim()) {
      setForm(f => ({ ...f, name: form.host! }))
    }

    const data = {
      name: form.name?.trim() || form.host!,
      host: form.host!.trim(),
      port: form.port ?? 22,
      username: form.username!.trim(),
      password: authMode === 'password' ? form.password : undefined,
      privateKey: authMode === 'key' ? form.privateKey : undefined,
      passphrase: authMode === 'key' ? form.passphrase : undefined,
      color: form.color,
    }

    if (editServerId) {
      updateServer(editServerId, data)
      toast('success', t('server.success.updated'))
    } else {
      addServer(data)
      toast('success', t('server.success.added', { name: data.name }))
    }
    handleClose()
  }

  const testConnection = async () => {
    if (!form.host?.trim()) return toast('error', t('server.error.hostRequiredForTest'))
    setTesting(true)
    const testId = 'test_' + Date.now()
    try {
      const result = await window.electron?.sshConnect({
        id: testId,
        host: form.host,
        port: form.port ?? 22,
        username: form.username ?? 'root',
        password: authMode === 'password' ? form.password : undefined,
        privateKey: authMode === 'key' ? form.privateKey : undefined,
        passphrase: authMode === 'key' ? form.passphrase : undefined,
      })
      if (result?.success) {
        toast('success', t('server.success.testPassed'))
        window.electron?.sshDisconnect(testId)
      }
    } catch (err: any) {
      toast('error', t('server.error.testFailed', { error: err?.error ?? err?.message }))
    } finally {
      setTesting(false)
    }
  }

  if (!showAddServer) return null

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">
            {editServerId ? t('server.title.edit') : t('server.title.add')}
          </span>
          <button className="icon-btn" onClick={handleClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">{t('server.label.name')}</label>
            <input
              className="form-input"
              placeholder={t('server.placeholder.name')}
              value={form.name ?? ''}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('server.label.host')}</label>
              <input
                className="form-input"
                placeholder={t('server.placeholder.host')}
                value={form.host ?? ''}
                onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('server.label.port')}</label>
              <input
                className="form-input"
                type="number"
                placeholder={t('server.placeholder.port')}
                value={form.port ?? 22}
                onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || 22 }))}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('server.label.username')}</label>
            <input
              className="form-input"
              placeholder={t('server.placeholder.username')}
              value={form.username ?? ''}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            />
          </div>

          {/* Auth Mode Toggle */}
          <div className="form-group">
            <label className="form-label">{t('server.label.authMode')}</label>
            <div className="tabs-toggle">
              <button
                className={`tabs-toggle-btn ${authMode === 'password' ? 'active' : ''}`}
                onClick={() => setAuthMode('password')}
              >{t('server.auth.password')}</button>
              <button
                className={`tabs-toggle-btn ${authMode === 'key' ? 'active' : ''}`}
                onClick={() => setAuthMode('key')}
              >{t('server.auth.key')}</button>
            </div>
          </div>

          {authMode === 'password' ? (
            <div className="form-group">
              <label className="form-label">{t('server.label.password')}</label>
              <input
                className="form-input"
                type="password"
                placeholder={t('server.placeholder.password')}
                value={form.password ?? ''}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">{t('server.label.privateKey')}</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder={t('server.placeholder.privateKey')}
                  value={form.privateKey ?? ''}
                  onChange={e => setForm(f => ({ ...f, privateKey: e.target.value }))}
                />
                <span className="form-hint">{t('server.hint.privateKey')}</span>
              </div>
              <div className="form-group">
                <label className="form-label">{t('server.label.passphrase')}</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder={t('server.placeholder.passphrase')}
                  value={form.passphrase ?? ''}
                  onChange={e => setForm(f => ({ ...f, passphrase: e.target.value }))}
                />
              </div>
            </>
          )}

          {/* Color Picker */}
          <div className="form-group">
            <label className="form-label">{t('server.label.color')}</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ACCENT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: c,
                    border: form.color === c ? '2px solid white' : '2px solid transparent',
                    cursor: 'pointer',
                    boxShadow: form.color === c ? `0 0 8px ${c}` : undefined,
                    transition: 'all 150ms ease',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-ghost"
            onClick={testConnection}
            disabled={testing}
          >
            {testing ? <span className="spinner" /> : null}
            {testing ? t('server.btn.testing') : t('server.btn.test')}
          </button>
          <button className="btn btn-secondary" onClick={handleClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {editServerId ? t('server.btn.submit.edit') : t('server.btn.submit.add')}
          </button>
        </div>
      </div>
    </div>
  )
}
