# 仓库指南

## 项目结构与模块组织

- `src/main`：Electron 主进程代码（窗口生命周期、后端编排）。
- `src/preload`：暴露给渲染进程的 Preload 桥接与类型声明。
- `src/renderer`：Vue 3 前端（`src/renderer/src` 为应用代码，`assets/` 为静态样式/图片，`components/` 为 UI 组件）。
- `services/asr`：Python ASR 服务（`main.py`、`requirements.txt`、`pyproject.toml`、本地 shim）。
- `build` 和 `resources`：应用图标、权限配置与打包资源。
- `electron-builder.ts`：Electron Builder 配置文件（TypeScript 格式）。
- `out`：构建生成产物；不要手动编辑。

## 构建、测试与开发命令

- `pnpm install`：安装 JS/Electron 依赖。
- `pnpm dev`：以本地开发模式运行 Electron + Vite。
- `pnpm dev:debug`：以 CDP 调试端口（`9222`）运行 Electron，供浏览器自动化工具使用。
- `pnpm typecheck`：同时执行 Node 与 Web 端 TypeScript 类型检查。
- `pnpm lint`：对 TS/Vue 文件运行 ESLint。
- `pnpm format`：应用 Prettier 格式化。
- `pnpm build`：先执行 typecheck，再产出生产构建包。
- `pnpm build:mac` / `pnpm build:win` / `pnpm build:linux`：按平台打包安装程序。

## 打包与分发（含 Python 嵌入式环境）

### 准备 Python 嵌入式环境

ASR 服务使用 `python-build-standalone` 提供的独立 Python 3.12 运行时，与系统 Python 隔离：

```bash
# 下载 Python 3.12 并安装 ASR 依赖到 resources/python/
pnpm run python:prepare
```

此命令仅需在以下情况执行：
- 首次克隆仓库后准备打包
- `services/asr/requirements.txt` 变更后
- CI/CD 构建流程中

**国内镜像加速**（可选）：
```bash
# 使用 ghfast 镜像加速下载
export PYTHON_BUILD_STANDALONE_MIRROR=ghfast
pnpm run python:prepare
```

### 构建流程

```bash
# 标准开发构建（不包含 Python 准备）
pnpm run build

# 完整构建（含 Python 准备 + 打包）
pnpm run build:full

# 打包特定平台
pnpm run build:mac     # macOS .dmg
pnpm run build:win     # Windows .exe 安装程序
pnpm run build:linux   # Linux AppImage/.deb

# 验证打包结果
pnpm run python:verify
```

### 打包架构

- **Python 运行时**：通过 `electron-builder` 的 `extraResources` 配置打包到应用资源目录
- **模型文件**：运行时下载到用户数据目录（`userData/models/`），不包含在应用包内
- **运行时路径解析**：`src/main/pythonEnv.ts` 在开发和生产环境都仅使用嵌入式 Python（`resources/python`）

详细说明参阅 `.docs/PACKAGING.md`。

## Electron 调试（agent-browser）

- 以调试模式启动应用：`pnpm dev:debug`。
- 验证 CDP 端点：`curl http://127.0.0.1:9222/json/version`。
- 连接自动化客户端：`agent-browser connect 9222`。
- 检查当前页面与引用：`agent-browser snapshot -i`。
- 进行 ASR 测试时，在 `Path` 输入框填入音频绝对路径，然后点击 `Transcribe`。
- 读取 `Raw Response` 文本框中的 JSON 输出，调试后端/渲染层数据流。
- 限制：`agent-browser` 无法操作系统原生文件选择对话框；请改用 `Path` 输入框。

## 代码风格与命名规范

- 使用 2 空格缩进、LF 行尾、UTF-8（`.editorconfig`）。
- Prettier 规则：单引号、无分号、`printWidth: 100`（`.prettierrc.yaml`）。
- `.vue` 文件中的 `script` 代码块使用 TypeScript。
- 命名：Vue 组件使用 PascalCase（如 `Versions.vue`），工具/服务模块使用 camelCase（如 `modelManager.ts`）。
- 保持 main/preload/renderer 职责分离；避免在主进程中导入仅渲染进程可用的代码。

## 测试指南

- 单元测试：`pnpm run test:unit`（Vitest）
- 端到端测试：`pnpm run test:e2e`（Playwright + Electron）
- 全量测试：`pnpm run test:all`
- PR 的最低门槛：运行 `pnpm lint` 和 `pnpm typecheck`。
- 对行为变更，请在 PR 描述中提供可复现的手动验证步骤（环境、操作、预期结果）。
- 若新增测试，优先采用同目录的 `*.test.ts` 文件，并在 `package.json` 中记录新的测试命令。

## Commit 与 Pull Request 规范

- 当前仓库没有提交历史；从现在开始采用 Conventional Commits：
  - `feat: add offline model selection`
  - `fix: handle ASR process timeout`
- 保持提交聚焦且原子化；避免将重构与行为变更混在同一次提交中。
- PR 应包含：目的、关键改动、验证命令/结果，以及 UI 变更的截图/GIF。
- 关联相关 issue，并说明任何平台特定的打包影响。

## 安全与配置建议

- 不要提交密钥、令牌或本地虚拟环境内部文件。
- 在受限网络安装依赖前，检查 `.npmrc` 与镜像配置。
- 不使用 `services/asr/.venv`；统一使用嵌入式 Python（`resources/python`），通过 `pnpm run python:prepare` 维护。
