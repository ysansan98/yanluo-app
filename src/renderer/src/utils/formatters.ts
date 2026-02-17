import type { TranscriptSource } from '../types/ui'

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0)
    return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0)
    return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function sourceLabel(source: TranscriptSource): string {
  const labels: Record<TranscriptSource, string> = {
    file: '文件上传',
    live: '实时识别',
  }
  return labels[source] || source
}

export function isToday(timestamp: number): boolean {
  const d = new Date(timestamp)
  const now = new Date()
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}
