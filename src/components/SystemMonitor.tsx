import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import { useToast } from '../hooks/useToast'

interface SystemInfo {
  hostname: string
  os: string
  uptime: string
  cpuModel: string
  cpuCores: number
  cpuUsage: number
  memory: {
    total: number
    used: number
    percent: number
  }
  disks: {
    filesystem: string
    total: number
    used: number
    percent: number
    mount: string
  }[]
}

interface Props {
  tabId: string
  serverName: string
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d} 天 ${h} 小时 ${m} 分钟`
  if (h > 0) return `${h} 小时 ${m} 分钟`
  return `${m} 分钟`
}

function formatBytes(bytes: number): string {
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return 'var(--error)'
  if (percent >= 70) return 'var(--warning)'
  return 'var(--success)'
}

function ProgressRing({ percent, size = 64, strokeWidth = 6 }: { percent: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference
  const color = getUsageColor(percent)

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size > 60 ? 14 : 11, fontWeight: 700, color,
      }}>
        {percent.toFixed(1)}%
      </div>
    </div>
  )
}

function DiskBar({ percent }: { percent: number }) {
  const color = getUsageColor(percent)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-active)', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(percent, 100)}%`,
          height: '100%',
          borderRadius: 4,
          background: color,
          transition: 'width 0.6s ease',
        }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 42, textAlign: 'right' }}>
        {percent.toFixed(1)}%
      </span>
    </div>
  )
}

export default function SystemMonitor({ tabId, serverName }: Props) {
  const { setShowMonitor } = useAppStore()
  const { toast } = useToast()
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const collect = useCallback(async () => {
    try {
      // Gather all info in a single shell script for efficiency
      const script = `
HOSTNAME=$(hostname 2>/dev/null || cat /etc/hostname 2>/dev/null || echo "unknown")
OS=$(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | head -1 | cut -d'"' -f2 || uname -s)
UPTIME=$(cat /proc/uptime 2>/dev/null | awk '{print int($1)}' || echo "0")
CPU_MODEL=$(cat /proc/cpuinfo 2>/dev/null | grep "model name" | head -1 | sed 's/.*: //' || sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Unknown")
CPU_CORES=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "1")
CPU_USAGE=$(top -bn1 2>/dev/null | grep "Cpu(s)" | awk '{print 100-$8}' || top -l1 2>/dev/null | grep "CPU usage" | awk '{print $3}' | sed 's/%//')
if [ -z "$CPU_USAGE" ] || [ "$CPU_USAGE" = "0" ]; then
  CPU_USAGE=$(vm_stat 2>/dev/null | awk '/Pages free/ {free=$3} /Pages active/ {active=$3} /Pages inactive/ {inactive=$3} /Pages speculative/ {spec=$3} /Pages wired/ {wired=$3} END {total=free+active+inactive+spec+wired; used=active+wired; if(total>0) printf "%.1f", used/total*100; else print "0"}')
fi
MEM_INFO=$(free -b 2>/dev/null | awk 'NR==2{print $2,$3}' || vm_stat 2>/dev/null | awk '
  BEGIN{pagesize=4096}
  /Pages free/{free=$3}
  /Pages active/{active=$3}
  /Pages inactive/{inactive=$3}
  /Pages speculative/{spec=$3}
  /Pages wired down/{wired=$3}
  END{
    total=(free+active+inactive+spec+wired)*pagesize
    used=(active+wired)*pagesize
    print total, used
  }')
DISK_INFO=$(df -k 2>/dev/null | awk 'NR>1{printf "%s|%d|%d|%s\\n",$1,$2*1024,$3*1024,$6}' | grep '^/dev')

echo "HOSTNAME=$HOSTNAME"
echo "OS=$OS"
echo "UPTIME=$UPTIME"
echo "CPU_MODEL=$CPU_MODEL"
echo "CPU_CORES=$CPU_CORES"
echo "CPU_USAGE=$CPU_USAGE"
echo "MEM_INFO=$MEM_INFO"
echo "DISK_INFO_START"
echo "$DISK_INFO"
echo "DISK_INFO_END"
`
      const result = await window.electron?.sshExec({ id: tabId, command: script })
      const output = result?.stdout ?? ''
      const lines = output.split('\n')

      const get = (key: string) => {
        const line = lines.find((l: string) => l.startsWith(`${key}=`))
        return line ? line.slice(key.length + 1).trim() : ''
      }

      const hostname = get('HOSTNAME')
      const os = get('OS')
      const uptime = parseInt(get('UPTIME')) || 0
      const cpuModel = get('CPU_MODEL')
      const cpuCores = parseInt(get('CPU_CORES')) || 1
      const cpuUsage = parseFloat(get('CPU_USAGE')) || 0

      const memParts = get('MEM_INFO').split(' ')
      const memTotal = parseInt(memParts[0]) || 0
      const memUsed = parseInt(memParts[1]) || 0

      const diskStart = lines.indexOf('DISK_INFO_START')
      const diskEnd = lines.indexOf('DISK_INFO_END')
      const diskLines = diskStart >= 0 && diskEnd >= 0
        ? lines.slice(diskStart + 1, diskEnd).filter((l: string) => l.trim())
        : []

      const disks = diskLines.map((line: string) => {
        const [filesystem, total, used, mount] = line.split('|').map((s: string) => s.trim())
        const t = parseInt(total) || 0
        const u = parseInt(used) || 0
        return {
          filesystem,
          total: t,
          used: u,
          percent: t > 0 ? (u / t) * 100 : 0,
          mount: mount || filesystem,
        }
      }).filter((d: any) => d.total > 0)

      setInfo({
        hostname,
        os,
        uptime: formatUptime(uptime),
        cpuModel,
        cpuCores,
        cpuUsage,
        memory: {
          total: memTotal,
          used: memUsed,
          percent: memTotal > 0 ? (memUsed / memTotal) * 100 : 0,
        },
        disks,
      })
      setError(null)
    } catch (err: any) {
      setError(err?.message ?? '采集失败')
    } finally {
      setLoading(false)
    }
  }, [tabId])

  useEffect(() => {
    collect()
    timerRef.current = setInterval(collect, 3000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [collect])

  return (
    <div className="modal-overlay" onClick={() => setShowMonitor(null)}>
      <div
        className="modal-box"
        style={{ width: 520 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">📊 系统监控 - {serverName}</span>
          <button className="icon-btn" onClick={() => setShowMonitor(null)}>✕</button>
        </div>

        <div className="modal-body" style={{ minHeight: 200 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <div className="spinner" />
            </div>
          ) : error ? (
            <div className="empty-state">
              <div className="empty-state-icon">⚠️</div>
              <div className="empty-state-text">{error}</div>
              <button className="btn btn-secondary btn-sm" onClick={collect}>重试</button>
            </div>
          ) : info ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Host info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>主机名</span>
                  <span style={{ fontWeight: 500 }}>{info.hostname}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>操作系统</span>
                  <span style={{ fontWeight: 500, maxWidth: 280, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.os}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>运行时间</span>
                  <span style={{ fontWeight: 500 }}>{info.uptime}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>CPU</span>
                  <span style={{ fontWeight: 500, maxWidth: 320, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.cpuModel} ({info.cpuCores} 核)</span>
                </div>
              </div>

              {/* CPU + Memory rings */}
              <div style={{ display: 'flex', gap: 24, justifyContent: 'center', padding: '8px 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <ProgressRing percent={info.cpuUsage} size={76} strokeWidth={7} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>CPU 使用率</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <ProgressRing percent={info.memory.percent} size={76} strokeWidth={7} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>内存使用率</span>
                </div>
              </div>

              {/* Memory detail */}
              <div style={{
                background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)',
                padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
                fontSize: 12.5,
              }}>
                <span style={{ color: 'var(--text-muted)' }}>内存</span>
                <span style={{ fontWeight: 600 }}>
                  <span style={{ color: getUsageColor(info.memory.percent) }}>{formatBytes(info.memory.used)}</span>
                  {' / '}
                  {formatBytes(info.memory.total)}
                </span>
              </div>

              {/* Disks */}
              {info.disks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    磁盘使用
                  </div>
                  {info.disks.map((d, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                          {d.mount}
                        </span>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>
                          {formatBytes(d.used)} / {formatBytes(d.total)}
                        </span>
                      </div>
                      <DiskBar percent={d.percent} />
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                每 3 秒自动刷新
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
