import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import type { ServerConfig } from '../types'
import { getServerColor } from '../utils/helpers'
import { useToast } from '../hooks/useToast'

const ACCENT_COLORS = [
  '#7c3aed', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#8b5cf6',
  '#14b8a6', '#f97316',
]

export default function AddServerModal() {
  const { showAddServer, setShowAddServer, editServerId, setEditServerId, addServer, updateServer, servers } = useAppStore()
  const { toast } = useToast()
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
    if (!form.host?.trim()) return toast('error', '请输入服务器地址')
    if (!form.username?.trim()) return toast('error', '请输入用户名')
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
      toast('success', '服务器信息已更新')
    } else {
      addServer(data)
      toast('success', `已添加 ${data.name}`)
    }
    handleClose()
  }

  const testConnection = async () => {
    if (!form.host?.trim()) return toast('error', '请先填写服务器地址')
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
        toast('success', '✅ 连接测试成功！')
        window.electron?.sshDisconnect(testId)
      }
    } catch (err: any) {
      toast('error', `连接失败: ${err?.error ?? err?.message}`)
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
            {editServerId ? '✏️ 编辑服务器' : '＋ 添加服务器'}
          </span>
          <button className="icon-btn" onClick={handleClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">服务器名称</label>
            <input
              className="form-input"
              placeholder="My Server（可选，默认使用主机名）"
              value={form.name ?? ''}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">主机地址</label>
              <input
                className="form-input"
                placeholder="192.168.1.1 或 example.com"
                value={form.host ?? ''}
                onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">端口</label>
              <input
                className="form-input"
                type="number"
                placeholder="22"
                value={form.port ?? 22}
                onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || 22 }))}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">用户名</label>
            <input
              className="form-input"
              placeholder="root"
              value={form.username ?? ''}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            />
          </div>

          {/* Auth Mode Toggle */}
          <div className="form-group">
            <label className="form-label">认证方式</label>
            <div className="tabs-toggle">
              <button
                className={`tabs-toggle-btn ${authMode === 'password' ? 'active' : ''}`}
                onClick={() => setAuthMode('password')}
              >🔑 密码</button>
              <button
                className={`tabs-toggle-btn ${authMode === 'key' ? 'active' : ''}`}
                onClick={() => setAuthMode('key')}
              >🗝️ 私钥</button>
            </div>
          </div>

          {authMode === 'password' ? (
            <div className="form-group">
              <label className="form-label">密码</label>
              <input
                className="form-input"
                type="password"
                placeholder="SSH 密码"
                value={form.password ?? ''}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">私钥内容</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="粘贴 PEM 格式私钥 (-----BEGIN RSA/EC/OPENSSH PRIVATE KEY-----)"
                  value={form.privateKey ?? ''}
                  onChange={e => setForm(f => ({ ...f, privateKey: e.target.value }))}
                />
                <span className="form-hint">支持 RSA、EC、Ed25519 等格式私钥</span>
              </div>
              <div className="form-group">
                <label className="form-label">私钥密码（可选）</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="如私钥有密码保护，请填写"
                  value={form.passphrase ?? ''}
                  onChange={e => setForm(f => ({ ...f, passphrase: e.target.value }))}
                />
              </div>
            </>
          )}

          {/* Color Picker */}
          <div className="form-group">
            <label className="form-label">标签颜色</label>
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
            {testing ? '测试中...' : '🔌 测试连接'}
          </button>
          <button className="btn btn-secondary" onClick={handleClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {editServerId ? '保存修改' : '添加服务器'}
          </button>
        </div>
      </div>
    </div>
  )
}
