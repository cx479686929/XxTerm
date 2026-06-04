import type { TranslationMap } from '../types'

const monitor: TranslationMap = {
  'title': '📊 系统监控 - {name}',
  'hostname': '主机名',
  'os': '操作系统',
  'uptime': '运行时间',
  'cpu': 'CPU',
  'cpuCores': '{model} ({cores} 核)',
  'cpuUsage': 'CPU 使用率',
  'memoryUsage': '内存使用率',
  'memory': '内存',
  'diskUsage': '磁盘使用',
  'autoRefresh': '每 3 秒自动刷新',
  'error.collect': '采集失败',
  'days': '天',
  'hours': '小时',
  'minutes': '分钟',
}

export default monitor
