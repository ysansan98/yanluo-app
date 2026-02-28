import { describe, expect, it } from 'vitest'
import { formatDuration, sourceLabel } from '../../src/renderer/src/utils/formatters'

describe('formatters', () => {
  // 验证毫秒时长会按秒级输出（四舍五入）
  it('formats duration in seconds', () => {
    expect(formatDuration(1500)).toBe('2s')
  })

  // 验证长时长会输出为 h/m/s 组合格式
  it('formats duration in hours/minutes/seconds', () => {
    expect(formatDuration(3_723_000)).toBe('1h 2m 3s')
  })

  // 验证来源枚举会映射为中文展示文案
  it('returns localized source labels', () => {
    expect(sourceLabel('live')).toBe('实时识别')
  })
})
