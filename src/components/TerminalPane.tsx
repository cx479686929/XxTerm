import { useEffect, useRef } from 'react'
import type { TabItem } from '../types'
import { useAppStore } from '../stores/appStore'
import { themes } from '../themes'
import { useI18n } from '../i18n'

interface Props {
  tab: TabItem
}

const isLocal = (tab: TabItem) => tab.type === 'local'

export default function TerminalPane({ tab }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const shellStartedRef = useRef(false)
  const { settings, updateTab, activeTabId } = useAppStore()
  const { t } = useI18n()

  const local = isLocal(tab)

  // Initialize xterm.js exactly once per tab
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let alive = true
    let pollInterval: ReturnType<typeof setInterval> | undefined

    ;(async () => {
      // Import xterm CSS (required for scrolling, cursor, and layout)
      const xtermCss = await import('@xterm/xterm/css/xterm.css')
      const xtermStyle = document.createElement('style')
      xtermStyle.textContent = (xtermCss as any).default || ''
      document.head.appendChild(xtermStyle)
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')

      if (!alive || !container) return

      const theme = themes[settings.theme]?.terminal ?? themes.midnight.terminal

      const term = new Terminal({
        theme,
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        cursorStyle: settings.cursorStyle,
        cursorBlink: settings.cursorBlink,
        scrollback: settings.scrollback,
        allowTransparency: true,
        macOptionIsMeta: true,
        allowProposedApi: true,
        ...(settings.theme !== 'midnight' ? {} : { padding: { top: 8, right: 8, bottom: 8, left: 8 } as any }),
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())

      term.open(container)
      fitAddon.fit()

      termRef.current = term
      fitAddonRef.current = fitAddon

      // Send user input — route to local PTY or SSH based on tab type
      term.onData((data: string) => {
        if (local) {
          window.electron?.localWrite({ id: tab.id, data })
        } else {
          window.electron?.sshWrite({ id: tab.id, data })
        }
      })

      if (local) {
        // Local terminal — shell can start immediately
        doStartShell(term, fitAddon)
      } else {
        // SSH terminal — wait for connection
        const currentTab = useAppStore.getState().tabs.find(t => t.id === tab.id)
        if (currentTab?.status === 'connected') {
          doStartShell(term, fitAddon)
        } else if (currentTab?.status === 'connecting') {
          term.write(`\r\n  \x1b[33m⏳ ${t('terminal.connecting')}\x1b[0m\r\n`)
          // Poll until errored — shell start is handled by the tab.status effect below
          pollInterval = setInterval(() => {
            const tabState = useAppStore.getState().tabs.find(tb => tb.id === tab.id)
            if (tabState?.status !== 'connecting') {
              clearInterval(pollInterval)
              if (tabState?.status === 'error') {
                term.write(`\r\n  \x1b[31m✗ ${t('terminal.connectFailed')}\x1b[0m\r\n`)
              }
            }
          }, 200)
        } else if (currentTab?.status === 'error') {
          term.write(`\r\n  \x1b[31m✗ ${t('terminal.connectFailed')}\x1b[0m\r\n`)
        }
      }
    })()

    return () => {
      alive = false
      if (pollInterval) clearInterval(pollInterval)
      // Disconnect on unmount
      if (local) {
        window.electron?.localDisconnect(tab.id)
      }
      termRef.current?.dispose()
      termRef.current = null
      fitAddonRef.current = null
      shellStartedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  // When tab status changes to connected, start shell if not yet started (SSH only)
  useEffect(() => {
    if (!local && tab.status === 'connected' && termRef.current && fitAddonRef.current && !shellStartedRef.current) {
      doStartShell(termRef.current, fitAddonRef.current)
    }
  }, [tab.status])

  // Sync terminal theme + font settings when they change
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const terminalTheme = themes[settings.theme]?.terminal ?? themes.midnight.terminal
    term.options.theme = terminalTheme
    term.options.fontFamily = settings.fontFamily
    term.options.fontSize = settings.fontSize
    term.options.cursorStyle = settings.cursorStyle
    term.options.cursorBlink = settings.cursorBlink
    // Disable transparency for light themes to prevent wash-out
    term.options.allowTransparency = settings.theme !== 'light'
    if (activeTabId === tab.id) {
      try { fitAddonRef.current?.fit() } catch {}
    }
  }, [settings.theme, settings.fontFamily, settings.fontSize, settings.cursorStyle, settings.cursorBlink])

  // Handle resize — only fit and notify remote when this tab is active
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(() => {
      if (!fitAddonRef.current) return
      if (activeTabId !== tab.id) return
      try {
        fitAddonRef.current.fit()
        const dims = fitAddonRef.current.proposeDimensions()
        if (dims) {
          if (local) {
            window.electron?.localResize({ id: tab.id, cols: dims.cols, rows: dims.rows })
          } else {
            window.electron?.sshResize({ id: tab.id, cols: dims.cols, rows: dims.rows })
          }
        }
      } catch {}
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [tab.id, activeTabId])

  // When this tab becomes active, re-fit the terminal (container size may have changed while hidden)
  useEffect(() => {
    if (activeTabId === tab.id && fitAddonRef.current) {
      // Delay slightly to let the DOM update display:none → flex
      const timer = setTimeout(() => {
        if (!fitAddonRef.current) return
        try {
          fitAddonRef.current.fit()
          const dims = fitAddonRef.current.proposeDimensions()
          if (dims) {
            if (local) {
              window.electron?.localResize({ id: tab.id, cols: dims.cols, rows: dims.rows })
            } else {
              window.electron?.sshResize({ id: tab.id, cols: dims.cols, rows: dims.rows })
            }
          }
        } catch {}
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [activeTabId, tab.id])

  // Extract shell start logic
  function doStartShell(term: any, fitAddon: any) {
    if (shellStartedRef.current) return
    shellStartedRef.current = true

    const dims = fitAddon.proposeDimensions()
    const cols = dims?.cols ?? 80
    const rows = dims?.rows ?? 24

    // Clear any "connecting..." messages, let the shell's output speak for itself
    term.clear()

    ;(async () => {
      try {
        if (local) {
          // ── Local PTY shell ──
          const unsubData = window.electron?.onLocalData(tab.id, (data: string) => {
            term.write(data)
          })

          const unsubClose = window.electron?.onLocalClose(tab.id, () => {
            term.write(`\r\n\x1b[33m${t('terminal.terminalClosed')}\x1b[0m\r\n`)
            updateTab(tab.id, { status: 'disconnected' })
            unsubData?.()
          })

          await window.electron?.localShell({ id: tab.id, cols, rows })
        } else {
          // ── SSH remote shell ──
          // Register data listener BEFORE opening shell to avoid race conditions
          const unsubData = window.electron?.onSshData(tab.id, (data: string) => {
            term.write(data)
          })

          const unsubClose = window.electron?.onSshClose(tab.id, () => {
            term.write(`\r\n\x1b[33m${t('terminal.connectionClosed')}\x1b[0m\r\n`)
            updateTab(tab.id, { status: 'disconnected' })
            unsubData?.()
          })

          // Now open the shell — all remote output flows through the listener above
          await window.electron?.sshShell({ id: tab.id, cols, rows })

          // Inject a colorful PS1 prompt after shell starts (invisible to user).
          // Uses ssh:exec to write script to /tmp (silent), then ssh:write with
          // stty -echo to source it. ANSI erase cleans up leaked echo artifacts.
          setTimeout(async () => {
            try {
              const b64 = 'aWYgWyAtbiAiJFpTSF9WRVJTSU9OIiBdOyB0aGVuCiAgYXV0b2xvYWQgLVV6IHZjc19pbmZvCiAgenN0eWxlICI6dmNzX2luZm86KiIgZW5hYmxlIGdpdAogIHpzdHlsZSAiOnZjc19pbmZvOmdpdCoiIGZvcm1hdHMgIiAlRnttYWdlbnRhfSViJWYiCiAgc2V0b3B0IFBST01QVF9TVUJTVAogIF94eHRlcm1fcHMxKCkgewogICAgdmNzX2luZm8KICAgIGxvY2FsIHJjPSQ/CiAgICBsb2NhbCByaT0iIgogICAgaWYgWyAkcmMgLWVxIDAgXTsgdGhlbiByaT0iJUZ7Z3JlZW59JSg/LuKcky7inJcpICVmICI7IGVsc2Ugcmk9IiVGe3JlZH3inJcgJHtyY30lZiAiOyBmaQogICAgUFMxPSIke3JpfSVGe2N5YW59JW4lZkAlRnt5ZWxsb3d9JW0lZjolRntibHVlfSV+JWYke3Zjc19pbmZvX21zZ18wX30iJCdcbiciJWYlIyAiCiAgfQogIHByZWNtZF9mdW5jdGlvbnMrPShfeHh0ZXJtX3BzMSkKZWxzZQogIF94eHRlcm1fcHMxKCkgewogICAgbG9jYWwgcmM9JD8KICAgIGxvY2FsIFI9JCdcZVswbScKICAgIGxvY2FsIFU9JCdcZVsxOzM2bScKICAgIGxvY2FsIEg9JCdcZVsxOzMzbScKICAgIGxvY2FsIEQ9JCdcZVsxOzM0bScKICAgIGxvY2FsIEc9JCdcZVsxOzM1bScKICAgIGxvY2FsIE9LPSQnXGVbMTszMm0nCiAgICBsb2NhbCBGTD0kJ1xlWzE7MzFtJwogICAgbG9jYWwgcmk9IiIKICAgIGlmIFsgJHJjIC1lcSAwIF07IHRoZW4gcmk9IlxbJHtPS31cXeKckyBcWyR7Un1cXSI7IGVsc2Ugcmk9IlxbJHtGTH1cXeKclyAke3JjfSBcWyR7Un1cXSI7IGZpCiAgICBsb2NhbCBnYj0kKGdpdCBzeW1ib2xpYy1yZWYgLS1zaG9ydCBIRUFEIDI+L2Rldi9udWxsKQogICAgbG9jYWwgZ2k9IiIKICAgIGlmIFsgLW4gIiRnYiIgXTsgdGhlbiBnaT0iIFxbJHtHfVxd4o6HICR7Z2J9XFske1J9XF0iOyBmaQogICAgUFMxPSIke3JpfVxbJHtVfVxdXHVcWyR7Un1cXUBcWyR7SH1cXVxoXFske1J9XF06XFske0R9XF1cd1xbJHtSfVxdJHtnaX1cblxbJHtSfVxdXCQgIgogIH0KICBQUk9NUFRfQ09NTUFORD0iX3h4dGVybV9wczEiCmZpCg=='
              // Step 1: Write PS1 script to /tmp via exec channel (completely silent)
              await window.electron?.sshExec({ id: tab.id, command: `echo '${b64}' | base64 -d > /tmp/.xxterm_ps1` })
              // Step 2: Save cursor position before injecting commands
              term.write('\x1b[s')
              window.electron?.sshWrite({ id: tab.id, data: 'stty -echo\n' })
              setTimeout(() => {
                window.electron?.sshWrite({ id: tab.id, data: 'source /tmp/.xxterm_ps1; rm -f /tmp/.xxterm_ps1; stty echo\n' })
                // Step 3: After PS1 is set, erase all leaked echo and re-trigger prompt
                setTimeout(() => {
                  term.write('\x1b[u')   // Restore cursor to end of original prompt line
                  term.write('\x1b[1K')   // Erase from line start to cursor (original prompt)
                  term.write('\x1b[0J')   // Erase everything below (echo + injected commands)
                  // Send Enter to make shell print the new colorful PS1 prompt
                  window.electron?.sshWrite({ id: tab.id, data: '\n' })
                }, 500)
              }, 200)
            } catch {}
          }, 500)
        }
      } catch (err: any) {
        term.write(`\r\n\x1b[31m${t('terminal.shellStartFailed', { error: err?.message ?? 'Unknown' })}\x1b[0m\r\n`)
      }
    })()
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* xterm container — always mounted */}
      <div
        ref={containerRef}
        className="xterm-wrapper"
        style={{ width: '100%', height: '100%' }}
      />
      {/* Connecting overlay — positioned absolutely on top (SSH only) */}
      {!local && tab.status === 'connecting' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            background: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            zIndex: 10,
          }}
        >
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)',
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>{t('terminal.connectedTo', { host: tab.serverHost })}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('terminal.establishingSSH')}</div>
        </div>
      )}
    </div>
  )
}
