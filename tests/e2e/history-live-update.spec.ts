import { expect, pushHistoryEntry, test } from './fixtures'

test('history list shows latest item after recognition completes', async ({ mainWindow }) => {
  const marker = `E2E-HISTORY-${Date.now()}`
  await pushHistoryEntry(mainWindow, marker)
  await expect(mainWindow.getByText(marker)).toBeVisible()
})
