# 言落（yanluo-app）

桌面端语音输入应用（V1 规划中），基于 `Electron + Vue 3 + TypeScript`，结合本地离线 ASR 与在线文本润色能力。

> 当前状态：**项目仍处于初步开发阶段**，功能与接口可能持续调整，不建议直接用于生产环境。

## 项目目标

- 在本地离线环境下完成语音转写（ASR）。
- 支持对转写文本进行在线润色。
- 第一阶段优先跑通 macOS，后续扩展到 Windows。

## 核心特性（V1 范围）

- 音频文件转写（优先支持）
- 应用内模型下载引导（ModelScope）
- 模型本地存储与状态检测
- 转写结果展示与可编辑
- 在线润色 API 对接（非离线）

## 技术栈

- 桌面端：`Electron + electron-vite + Vue 3`
- 本地 ASR 模型：`iic/SenseVoiceSmall-onnx`（量化版）
- 推理服务：`Python FastAPI` 独立进程
- 模型下载源：`ModelScope`

## 系统架构

- `src/main`：Electron 主进程（服务编排、模型管理、IPC）
- `src/preload`：Preload 桥接与类型声明
- `src/renderer`：Vue 前端（文件选择、状态展示、转写与润色交互）
- `services/asr`：Python ASR 服务（健康检查、文件转写、模型加载）

## 当前接口（ASR 服务）

- `GET /health`：服务健康检查
- `POST /asr/file`
  - 请求：`{ path: string, language?: string }`
  - 响应：`{ text: string, language: string }`

## 模型管理说明

- 模型不会随安装包分发。
- 首次启动若无模型，应提示下载。
- 示例下载命令（SenseVoice 量化版）：

```bash
python -m modelscope download --model iic/SenseVoiceSmall-onnx --local_dir <model_dir>
```

- macOS 默认目录：

```text
~/Library/Application Support/<App>/models/SenseVoiceSmall-onnx
```

## 开发命令

```bash
pnpm install        # 安装依赖
pnpm dev            # 开发模式运行
pnpm dev:debug      # 调试模式运行（CDP 9222）
pnpm lint           # 代码检查
pnpm typecheck      # 类型检查
pnpm format         # 代码格式化
pnpm build          # 生产构建
pnpm build:mac      # macOS 打包
pnpm build:win      # Windows 打包
pnpm build:linux    # Linux 打包
```

## 里程碑（摘要）

- M1：离线文件转写可用
- M2：模型下载闭环（含日志/重试）
- M3：在线润色可用
- M4：实时输入（后续）

## 风险与约束

- ASR 依赖链复杂，环境版本不匹配可能导致安装失败。
- 不同芯片（Intel / Apple Silicon）推理性能和兼容性存在差异。
- 首次模型下载体积较大，体验受网络质量影响。
- 在线润色依赖外部 API 的可用性与成本。
