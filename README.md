# XxTerm ⚡

> 跨平台精美 SSH 终端工具 — macOS / Windows / Linux

## 功能特性

- **🖥️ 多平台** — Electron 驱动，支持 macOS、Windows、Linux
- **🔒 SSH 连接** — 支持密码 & 私钥（RSA/Ed25519/EC）认证
- **📁 文件管理** — 内置 SFTP 文件浏览器，支持查看/编辑/删除
- **🎨 多主题** — 6 款精美主题：Midnight / Aurora / Ocean / Sakura / Matrix / Light
- **✨ 流畅动画** — 所有交互均有精心设计的过渡动画
- **🗂️ 多标签页** — 同时管理多个 SSH 会话
- **🔍 实时搜索** — 侧边栏服务器快速搜索过滤
- **🎯 右键菜单** — 快捷操作连接/编辑/删除
- **🍎 macOS 原生** — 毛玻璃效果，Traffic Light 按钮

## 快速开始

### 环境要求

- Node.js 18+
- macOS 12+ / Windows 10+ / Ubuntu 20.04+

### 安装运行

```bash
cd xxterm

# 安装依赖（跳过 Electron 二进制，首次需要手动处理）
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install

# 开发模式（需要 Electron 已安装）
npm run dev

# 构建产物
npm run build
```

### 修复 macOS Electron 权限问题

如果遇到 `EACCES: permission denied, mkdir '/Users/.../Library/Caches/electron'`，执行：

```bash
sudo chown -R $(whoami) ~/Library/Caches/electron
```

然后重新安装：

```bash
npm install
npm run electron:dev
```

## 项目结构

```
xxterm/
├── electron/
│   ├── main.ts          # 主进程：窗口、SSH、SFTP 逻辑
│   └── preload.ts       # 预加载：IPC 桥接
├── src/
│   ├── components/      # React 组件
│   │   ├── Titlebar.tsx       # 标题栏
│   │   ├── Sidebar.tsx        # 服务器列表侧边栏
│   │   ├── MainArea.tsx       # 主区域容器
│   │   ├── TabBar.tsx         # 多标签页栏
│   │   ├── TerminalPane.tsx   # xterm.js 终端
│   │   ├── FileManager.tsx    # SFTP 文件管理器
│   │   ├── AddServerModal.tsx # 添加/编辑服务器弹窗
│   │   ├── SettingsModal.tsx  # 设置面板
│   │   ├── WelcomeScreen.tsx  # 欢迎页
│   │   └── ToastContainer.tsx # Toast 通知
│   ├── stores/
│   │   └── appStore.ts  # Zustand 全局状态
│   ├── themes/
│   │   └── index.ts     # 6 款主题定义
│   ├── hooks/
│   │   └── useToast.ts  # Toast hooks
│   ├── types/
│   │   └── index.ts     # TypeScript 类型
│   ├── utils/
│   │   ├── helpers.ts   # 工具函数
│   │   └── nanoid.ts    # ID 生成
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css        # 全局样式（含主题 CSS 变量）
├── preview.html         # 高保真 UI 预览（无需 Electron）
└── vite.config.ts
```

## 技术栈

| 层次 | 技术 |
|------|------|
| 框架 | Electron 28 + React 18 + TypeScript 5 |
| 构建 | Vite 5 + vite-plugin-electron |
| 终端 | @xterm/xterm 5.4 + addon-fit + addon-web-links |
| SSH | ssh2 1.15 |
| 状态 | Zustand 4.5 (持久化) |
| 动画 | CSS Animations + Framer Motion |
| 图标 | Lucide React |

## 主题预览

| 主题 | 风格 |
|------|------|
| 🌑 Midnight | 深邃紫黑，经典暗色 |
| 🌿 Aurora | 极光绿，清新自然 |
| 🌊 Ocean | 深海蓝，沉静专注 |
| 🌸 Sakura | 樱花粉，温柔浪漫 |
| 💻 Matrix | 黑客绿，赛博朋克 |
| ☀️ Light | 明亮清爽，护眼日间 |
