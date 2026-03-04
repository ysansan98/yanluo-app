import { expect, test } from './fixtures'

// 验证 Electron 应用可启动且主界面关键入口可见
test('electron app launches and renders main shell', async ({ mainWindow }) => {
  await expect(mainWindow.getByRole('button', { name: /^首页$/ })).toBeVisible()
  await expect(mainWindow.getByRole('button', { name: /^设置$/ })).toBeVisible()
})
