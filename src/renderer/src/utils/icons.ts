// Load icon data from @iconify/json for offline use
import type { IconifyJSON } from '@iconify/types'

// Import the full Lucide icon set (at build time, will be tree-shaked to only used icons)
import lucideIcons from '@iconify/json/json/lucide.json'
import { getIcons } from '@iconify/utils'
import { addCollection } from '@iconify/vue'

// List of icons we need
const requiredIcons = [
  'home',
  'sparkles',
  'cloud',
  'settings',
  'info',
  'zap',
  'align-left',
  'languages',
  'briefcase',
  'clipboard-list',
  'wrench',
  'plus',
  'check',
  'alert-triangle',
  'chevron-down',
  'x',
  'external-link',
  'copy',
  'play',
  'pause',
  'skip-back',
  'skip-forward',
  'mic',
  'keyboard',
  'alert-circle',
  'clock',
  'lightbulb',
  'package',
  'lock',
  'arrow-left',
  'arrow-right',
  'circle-check',
]

// Extract only the icons we need
const filteredIcons = getIcons(lucideIcons as IconifyJSON, requiredIcons)

// Add icons to Iconify
export function loadIcons() {
  if (filteredIcons) {
    addCollection(filteredIcons as IconifyJSON)
  }
}
