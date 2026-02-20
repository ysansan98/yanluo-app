# 贡献指南

本项目开发与生产统一使用 **嵌入式 Python 环境**（`resources/python`），不依赖系统 Python，也不使用 `services/asr/.venv`。

## 1. 开发环境配置

### 前置要求

- Node.js 20+
- `pnpm` 10+
- macOS / Windows / Linux（按目标平台打包）

### 初始化

```bash
pnpm install
pnpm run python:prepare
```

说明：
- `python:prepare` 会下载 `python-build-standalone` 并安装 ASR 依赖到 `resources/python/`。
- 若网络较慢可用镜像：

```bash
export PYTHON_BUILD_STANDALONE_MIRROR=ghfast
pnpm run python:prepare
```

### 日常开发

```bash
pnpm dev
```

### 何时需要重新准备 Python

- 首次克隆仓库后
- `services/asr/requirements.txt` 变更后
- 本地 `resources/python` 被清理或损坏后

可强制重下：

```bash
PYTHON_FORCE_DOWNLOAD=1 pnpm run python:prepare
```

## 2. 提交前检查

```bash
pnpm run lint
pnpm run typecheck
```

打包验证（可选但建议）：

```bash
pnpm run build
pnpm run python:verify
```

## 3. 代码与提交流程

- 代码风格：2 空格缩进，TypeScript/Vue，Prettier + ESLint
- 提交规范：Conventional Commits（如 `feat: ...`、`fix: ...`）
- PR 请包含：改动目的、验证步骤、关键结果（UI 改动附截图/GIF）

