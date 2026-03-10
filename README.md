# Dual AI Chat (双模协作智能)

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![Google GenAI SDK](https://img.shields.io/badge/GenAI_SDK-v1.0-green?logo=google)](https://www.npmjs.com/package/@google/genai)
[![Vite](https://img.shields.io/badge/Vite-6.0+-purple?logo=vite)](https://vitejs.dev/)

**通过辩证思维，解锁 AI 的深层潜力。**

[在线体验](#-在线体验-live-demos) • [核心特性](#-核心特性) • [本地部署](#-本地部署) • [配置指南](#-配置指南)

</div>

**Dual AI Chat** 是一个基于 React 19 构建的下一代 AI 聊天应用。它引入了 **“协作智能”** 的概念，通过两个性格迥异的 AI 代理——**Cognito (逻辑)** 和 **Muse (创意)**——之间的内部辩论与协作，为您提供比单一模型更准确、更全面、经过深思熟虑的答案。

---

## 🌐 在线体验 (Live Demos)

无需安装，立即体验 Dual AI Chat 的强大功能：

| 平台 | 链接 | 说明 |
| :--- | :--- | :--- |
| **Google AI Studio** | [**🚀 点击免费使用**](https://ai.studio/apps/drive/1wS-wmXT_J4S-sfYxY1wItwh4UuV4STEk?fullscreenApplet=truea) | **推荐**。直接在 Google 官方环境中运行，通常无需配置 Key (或使用 Google 配额)。 |
| **Cloudflare Pages** | [**🌐 网页版 Demo**](https://c3d98006.dual-ai-chat-dvb.pages.dev/) | **静态演示版**。适合 Gemini；若要启用 OpenAI 兼容，请改用同仓 Vercel 部署，让 Python API 与前端同源。 |

---

## ✨ 核心特性

### 🧠 双 AI 辩证系统
用户的一个问题，会触发两个 AI 的即时协作：
*   **Cognito (逻辑引擎):** 负责事实核查、逻辑推理、结构化分析和最终答案的综合。
*   **Muse (创意引擎):** 负责横向思维、挑战假设、补充盲点和提供创新视角。

### ⚡ 深度支持“思考模型” (Thinking Models)
原生集成 Google Gemini 2.5 / 3.0 系列模型的深度思考能力：
*   **可视化控制:** 在设置中直观调节 Token 预算 (Budget) 和 思考强度 (Level)。
*   **混合模式:** 结合内部辩论与模型自身的思维链 (CoT)，处理复杂推理任务。

### 📝 智能协作记事本
记事本不仅是输出区域，更是 AI 的共享工作区：
*   **状态保持:** 两个 AI 均可读取并修改记事本，作为长对话的“外部记忆”。
*   **Diff 视图:** 新增差异对比模式，清晰展示 AI 对代码或文本的每一次修改（新增/删除）。
*   **全功能编辑器:** 支持 Markdown 预览、源码编辑及多步撤销/重做。

### 🔌 全兼容后端架构
*   **Google Gemini 原生:** 支持官方 API 及自定义代理 Endpoint。
*   **OpenAI 兼容接口:** 无缝对接 **DeepSeek**、**Ollama**、**LM Studio** 等本地或第三方大模型服务。

### 📱 现代化 UI/UX
*   **React 19 内核:** 利用最新的 React Hook 和并发特性构建，性能极致流畅。
*   **移动端适配:** 响应式布局，手机端自动切换为底部导航模式。
*   **多模态交互:** 支持图片上传与理解，AI 可基于视觉信息进行讨论。

---

## 💻 本地部署

### 1. 环境要求
*   Node.js v18+
*   npm 或 yarn
*   若要使用 OpenAI 兼容模式：Vercel 项目或本地 `vercel dev`

### 2. 安装项目
```bash
git clone https://github.com/your-username/dual-ai-chat.git
cd <repo-name>/dual-ai-chat
npm install
```

### 3. 配置 API Key / 服务端环境变量
为了方便开发，您可以在根目录创建 `.env.local` 文件（也可以稍后在网页 UI 中设置）：
```env
GEMINI_API_KEY="AIzaSy..."
```

如果要启用 OpenAI 兼容模式，请把 Vercel 项目根目录设为 `dual-ai-chat/`，并在 Vercel 环境变量中配置：

```env
OPENAI_COMPAT_BASE_URL="https://your-openai-compatible-host/v1"
OPENAI_COMPAT_API_KEY="sk-..."
OPENAI_COMPAT_REASONING_EFFORT="xhigh"
OPENAI_COMPAT_INTERNAL_MAX_OUTPUT_TOKENS="1200"
OPENAI_COMPAT_FINAL_MAX_OUTPUT_TOKENS="2200"
OPENAI_COMPAT_TIMEOUT_SECONDS="45"
```

### 4. 启动开发服务器
```bash
npm run dev
```
访问终端显示的地址（通常为 `http://localhost:3000`）。

> OpenAI 兼容模式现在走同源 Python API。线上推荐直接部署到 Vercel；本地若要联调这条链路，使用 `vercel dev` 比单独 `npm run dev` 更合适，因为后者不会启动 Python Function。

---

## ⚙️ 模型与 API 配置指南

本项目支持高度自定义的模型连接方式，您可以在界面右上角的 **设置 (⚙️)** 面板中灵活切换：

| 配置模式 | 适用场景 | 关键参数 |
| :--- | :--- | :--- |
| **标准 Gemini** | 最简单的 Google 官方服务接入 | 仅需 API Key (读取自环境变量或手动输入) |
| **自定义 Gemini** | 需要使用反向代理或 Vertex AI | Endpoint (如 `https://my-proxy.com`), API Key |
| **OpenAI 兼容** | **本地模型 (Ollama)**、**DeepSeek** 或其他兼容服务 | Base URL / API Key 在 Vercel Python API 环境变量中统一配置；Model ID 仍按角色在前端填写 |

> **提示:** OpenAI 兼容模式下，Cognito 和 Muse 仍可分别使用不同模型，并共享同一个 OpenAI reasoning 档位；模型 ID 在浏览器设置面板填写，URL / Token 由服务端环境变量统一提供。

---

## 🛠️ 技术栈详情

*   **Core:** React 19, TypeScript, Vite
*   **AI Integration:** `@google/genai` (Google Official SDK v1.0+)
*   **Styling:** Tailwind CSS, Lucide React (Icons)
*   **Utilities:**
    *   `marked` & `dompurify`: 安全的 Markdown 渲染
    *   `katex`: 数学公式渲染
    *   `diff`: 文本差异对比算法

---
