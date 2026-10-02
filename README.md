# OmniSubs - Universal Streaming Subtitles & AI Auto-Translator

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-success.svg)](manifest.json)
[![Platform Support](https://img.shields.io/badge/Streaming-Netflix%20|%20Prime%20|%20Crave%20|%20Disney+%20|%20Max%20|%20YouTube-red.svg)](#supported-platforms)
[![Tests](https://img.shields.io/badge/tests-33%20passed-brightgreen.svg)](tests/)

**全流媒体智能外挂字幕与时间轴自动校准扩展**  
Universal subtitle overlay & AI auto-translation for Netflix, Prime Video, Crave, Disney+, Max, YouTube, Apple TV+, and more.

</div>

---

## 🌟 核心特性 (Features)

### 1. ⚡ 全自动检索与智能双语翻译 (Zero-Friction Auto Translation)
- **片名与集数毫秒级识别**：无论是在 Netflix 播放列表、还是 Crave 的 `/play/` URL slug 架构，均能自动提取出 `剧集名 + 季数 + 集数`。
- **中文字幕优先下载**：自动检索最佳公开中文字幕源。
- **原生语种识别与双语转换**：若未发布官方中文字幕，自动提取原生英文 CC 语料并批量翻译为**中英双语字幕（中上英下）**，原始时间轴 100% 毫秒级保留！
- **自动切集无缝衔接**：连续追剧播放下一集时，自动清空旧字幕并秒级加载对应新一集字幕。

### 2. 🎯 原生字幕检测与插播广告时间轴校准 (Smart Native Calibrator)
- **攻克流媒体插播广告时间轴漂移难题**：针对 Prime Video、Crave 等带广告的播放流，因插播片头或中插广告导致外挂字幕时间轴整体错位的问题。
- **自动检测画面内置字幕**：通过下半区视觉定位和 `textTracks` 监听，毫秒级比对画面实际说出的对白（自动滤除标题栏与集数干扰）。
- **一键精准校准**：一键捕获当前原生字幕并完成微调同步（`±0.1s` / `±1.0s` 快捷键微调）。

### 3. 🛡️ 纯净安全 & 零 DRM 触碰 (DRM-Safe & Privacy First)
- **绝不触碰流媒体 DRM / Widevine**：不解密、不下采样、不抓取受保护音视频流，完全遵循各平台合规原则。
- **纯净主时钟同步**：唯一读取 HTML5 标准 `<video>` 的 `currentTime`，倍速、快进、倒退、拖动进度条均自然 100% 跟随。
- **Shadow DOM 独立沙箱渲染**：使用 `host.attachShadow({ mode: "open" })`，完全隔绝页面 CSS 污染，全屏自适应。
- **零隐私上传与无预埋密钥**：完全开源，所有字幕与翻译仅在浏览器本地运行，无后台追踪服务器。支持在设置中配置个人专属的 SubDL 或 OpenSubtitles API Key。

### 4. 🎨 外观、双语与排版实时预览 (Appearance Customization)
- **三种字幕排版**：中英双语 (中上英下，默认推荐)、仅中文字幕、英中双语 (英上中下)。
- **字体与边距平滑调节**：字号（18px ~ 48px）、底部边距（4% ~ 25%）、顶部/居中/底部三段位置。
- **三大院线预设**：
  - **胶囊黑底 (Pill)**：苹果级高透磨砂黑底，舒适防疲劳。
  - **立体黑边 (Outline)**：无背景框，8 向深度立体投影描边，还原院线质感。
  - **经典黑框 (Cinema)**：高对比度纯黑底框，强光画面下字字清晰。

---

## 📺 支持的流媒体平台 (Supported Platforms)

| 平台 (Platform) | 状态 (Status) | 说明 (Notes) |
| :--- | :---: | :--- |
| **Netflix** | ✅ 支持 | 专属 Page Bridge + DOM 深度解析 |
| **Amazon Prime Video** | ✅ 支持 | 支持中插广告自动校准 |
| **Crave** | ✅ 支持 | 支持 `/play/` URL slug 架构与广告对齐 |
| **Disney+** | ✅ 支持 | 播放器主时钟挂载 |
| **Max (HBO Max)** | ✅ 支持 | 支持全自动片名匹配 |
| **YouTube** | ✅ 支持 | 视频标题与外挂中英双语 |
| **Apple TV+** | ✅ 支持 | 网页播放器无缝适配 |
| **Hulu / Peacock / Paramount+** | ✅ 支持 | 通用 HTML5 播放器模式 |
| **Bilibili** | ✅ 支持 | 支持外挂字幕与本地拖拽 |

---

## 🚀 安装与使用 (Installation)

### 方式一：开发者模式加载（推荐，最新体验）

1. 点击本仓库右上角 **`Code` -> `Download ZIP`** 并解压，或克隆本仓库：
   ```bash
   git clone https://github.com/Joseph-Y-Lu/OmniSubs.git
   ```
2. 打开 Chromium 内核浏览器（Google Chrome / Microsoft Edge / Brave / Arc）：
   - 在地址栏输入：`chrome://extensions/`
3. 开启右上角的 **【开发者模式 (Developer mode)】** 开关。
4. 点击左上角的 **【加载已解压的扩展程序 (Load unpacked)】**。
5. 选择解压出来的项目根文件夹（即包含 `manifest.json` 的目录）。
6. 打开任意流媒体播放页面（如 Netflix / Crave / Prime Video），点击右上角扩展图标即可使用！

---

## ⌨️ 常用快捷键 (Shortcuts)

| 快捷键 (Hotkey) | 功能说明 (Description) |
| :--- | :--- |
| **`Alt + Q`** | 一键瞬间开启 / 关闭字幕插件 (Master Toggle) |
| **`Alt + ←`** / **`Alt + →`** | 字幕时间轴微调 `±0.1 秒` |
| **`Shift + Alt + ←`** / **`Shift + Alt + →`** | 字幕时间轴粗调 `±1.0 秒` |

---

## 🏗️ 架构与技术栈 (Architecture)

```
OmniSubs/
├── manifest.json                  # Chrome Extension Manifest V3 配置文件
├── package.json                   # 测试与打包配置
├── icons/                         # 扩展图标 (16, 48, 128)
├── src/
│   ├── background/
│   │   └── service-worker.js      # MV3 Service Worker: 聚合搜索与异步翻译调度
│   ├── content/
│   │   ├── netflix-detector.js    # 流媒体片名、集数多平台侦测引擎
│   │   ├── video-controller.js    # HTML5 Video 主时钟跟踪器
│   │   ├── subtitle-overlay.js    # Shadow DOM 独立字幕覆盖层与 HUD
│   │   └── content.js             # 页面端主调度生命周期管理器
│   ├── subtitle/
│   │   ├── subtitle-engine.js     # 毫秒级字幕对齐引擎
│   │   ├── native-calibrator.js   # 原生字幕检测与广告时间轴校准器
│   │   ├── subtitle-translator.js # 全量字幕批量快速翻译引擎
│   │   ├── srt-parser.js          # SRT 字幕解析器
│   │   ├── vtt-parser.js          # WebVTT 字幕解析器
│   │   └── subtitle-ranking.js    # 字幕候选评分与排序
│   ├── providers/
│   │   ├── provider-manager.js    # 多源聚合调度与自动回退中枢
│   │   ├── subdl.js               # SubDL 适配器与全季 ZIP 解析
│   │   └── opensubtitles.js       # OpenSubtitles 适配器
│   ├── storage/
│   │   └── storage.js             # 本地持久化与按集同步缓存
│   └── popup/
│       ├── popup.html             # 控制面板 UI
│       ├── popup.css              # 高端深色毛玻璃样式
│       └── popup.js               # 控制面板逻辑交互
└── tests/                         # 33 项全功能单元测试套件
```

---

## 🧪 运行单元测试 (Testing)

本项目包含完善的单元测试套件，覆盖字幕解析、多平台片名识别、全季 ZIP 选集解压与广告校准器算法：

```bash
npm test
```

---

## 📄 开源许可证 (License)

本项目采用 [MIT License](LICENSE) 开源协议。
