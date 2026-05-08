import { useAppStore } from '../stores/appStore'

interface Props {
  onClick?: () => void
}

export default function WelcomeScreen({ onClick }: Props) {
  const { setShowAddServer, servers } = useAppStore()

  return (
    <div className="welcome-screen">
      <div className="welcome-logo">⚡</div>
      <div className="welcome-title">XxTerm</div>
      <div className="welcome-subtitle">
        跨平台 SSH 终端工具 · 优雅、高效、开箱即用
      </div>

      <div className="welcome-shortcuts">
        <div className="shortcut-card" onClick={() => setShowAddServer(true)}>
          <div className="shortcut-icon">＋</div>
          <div className="shortcut-label">新建连接</div>
          <div className="shortcut-desc">添加 SSH 服务器</div>
        </div>
        <div className="shortcut-card" onClick={() => setShowAddServer(true)}>
          <div className="shortcut-icon">🔑</div>
          <div className="shortcut-label">密钥认证</div>
          <div className="shortcut-desc">支持私钥登录</div>
        </div>
        <div className="shortcut-card">
          <div className="shortcut-icon">📁</div>
          <div className="shortcut-label">文件管理</div>
          <div className="shortcut-desc">SFTP 文件浏览</div>
        </div>
        <div className="shortcut-card">
          <div className="shortcut-icon">🎨</div>
          <div className="shortcut-label">多彩主题</div>
          <div className="shortcut-desc">6 款精美主题</div>
        </div>
      </div>

      {servers.length > 0 && (
        <div style={{
          marginTop: 8,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}>
          {servers.length} 台服务器已配置 · 在左侧列表点击连接
        </div>
      )}
    </div>
  )
}
