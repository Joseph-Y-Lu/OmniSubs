# Chrome Web Store 发布指南与上架清单 (CHROMEWEBSTORE.md)

> 最近更新时间: 2026-10-01
> 版本: 0.1.0

本文档汇集了发布 **Netflix External Subtitle Overlay** 到 **Chrome 网上应用店 (Chrome Web Store)** 所需的全部准备材料。你可以直接复制各模块文本到 [Chrome 开发者控制台 (Chrome Developer Dashboard)](https://chrome.google.com/webstore/devconsole) 中。

---

## 快速发布流程 (Step-by-Step)

### 第一步：注册 Chrome 开发者账号
1. 打开 [Chrome 开发者控制台](https://chrome.google.com/webstore/devconsole)。
2. 使用你的 Google 账号登录。
3. 支付一次性开发者注册费（5 美元，Google 官方防滥用收费，一次付费永久有效）。

### 第二步：生成发布用 ZIP 安装包
在项目根目录下运行打包脚本：
```bash
npm run build:zip
```
打包成功后，会在 `dist/` 目录下生成 `netflix-subtitle-overlay.zip`。
（该包已自动剔除测试代码、markdown 文档及开发配置文件，仅包含纯净的前端生产文件）。

### 第三步：上传并填写资料
1. 在开发者控制台中点击右上角 **「添加新项 (New Item)」**。
2. 上传 `dist/netflix-subtitle-overlay.zip`。
3. 参考下方各个板块的内容，直接复制粘贴到控制台对应的字段中。
4. 点击 **「提交审核 (Submit for Review)」**，通常 1~3 个工作日内即可完成审核并上架。

---

## 1. 商店基础信息 (Store Listing)

### 扩展名称 (Extension Name) [必填]
```text
Netflix External Subtitle Overlay - 双语外挂字幕助手
```
*(英文可填: `Netflix External Subtitle Overlay - Dual Subtitles`)*

### 简短说明 (Short Description) [必填，最多 132 字符]
```text
为 Netflix 视频提供外挂中文字幕与中英双语字幕支持，支持智能自动匹配、本地字幕导入与毫秒级时间轴微调。
```
*(英文版 132 字符以内)*:
```text
Add external subtitles (SRT, VTT) and bilingual Chinese-English subtitles to Netflix with auto-search and millisecond sync.
```

### 详细说明 (Detailed Description) [必填]
> **注意**：Chrome Web Store 不支持复杂的 Markdown 语法，请直接使用以下分段纯文本粘贴：

```text
Netflix External Subtitle Overlay 是一款轻量、无干扰且高度自适应的 Netflix 外挂双语字幕工具。

无需修改任何视频源或 DRM 限制，即可在观看 Netflix 剧集与电影时自由加载外挂中文字幕、双语字幕或本地字幕文件，告别原生字幕缺失与生肉观影困扰。

★ 核心功能亮点：

1. 智能自动匹配字幕
- 播放视频时自动识别当前影片与剧集，秒级自动检索并加载精校中文字幕或中英双语字幕。
- 换片或切换下一集时自动识别与清空，不留老字幕残留，完美支持网飞单页流畅切片。

2. 丰富的字幕源支持
- 支持本地电脑直接拖拽或浏览导入 .srt 和 .vtt 字幕文件。
- 内置 SubDL 等公共开源字幕源生态，支持按片名与语言一键在线检索下载。

3. 原生级播放体验与时间轴同步
- 字幕渲染基于独立隔离图层，清晰锐利，绝不遮挡网飞原生控制栏与进度条。
- 支持快捷键毫秒级同步微调（快捷键 Z 后退 0.5s，X 前进 0.5s，R 重置为 0），彻底解决音画不同步。

4. 丰富的双语与样式自定义
- 支持「中英双语（中文在上）」、「双语（英文在上）」与「纯中文单语」自由切换。
- 自由调节字幕字号、底部间距、字体类型、文字高亮颜色与半透明背景底衬。
- 自动记忆你的偏好设置与已调好的单集时间轴同步值。

5. 隐私与安全至上
- 纯前端客户端运行，不收集用户任何浏览隐私、账号密码或观影历史。
- 零多余权限，代码安全透明。

★ 使用方法：
1. 安装本扩展并在 Chrome 扩展管理栏中固定图标。
2. 打开任意 Netflix 视频播放页面 (netflix.com/watch/...)。
3. 扩展会自动开始识别片名并检索字幕，或点击右上角扩展图标手动搜索或拖拽导入字幕。
4. 使用快捷键 Z / X / C 或控制面板调节时间轴对齐。
```

### 分类 (Category) [必填]
- **主类别**: `Accessibility` (无障碍/辅助功能) 或 `Productivity` (实用工具)
- **次要类别**: `Fun` (娱乐)

### 单一用途说明 (Single Purpose) [必填]
```text
Displays synchronized external and bilingual subtitles on Netflix video playback without modifying media content.
```

### 主要语言 (Primary Language) [必填]
- `English` 或 `Chinese (Simplified)`（根据你的目标用户选择，建议中文或英语）

---

## 2. 图片与视觉资源 (Graphics & Assets)

控制台需要上传以下尺寸的图片：

| 资产类型 | 推荐尺寸 | 状态 | 说明 |
| :--- | :--- | :--- | :--- |
| **应用图标 (Store Icon)** | `128×128` PNG | ✅ 已就绪 | 直接使用项目内的 `icons/icon-128.png` |
| **应用截图 (Screenshots)** | `1280×800` 或 `640×400` PNG/JPEG (至少 1 张) | ⬜ 待截取 | 截取一张打开网飞播放视频且带有本插件字幕悬浮窗的实际高清效果图 |
| **小宣传图 (Small Promo Tile)** | `440×280` PNG (可选) | ⬜ 可选 | 商店推荐位展示，可在 Canva 简单制作 |
| **大横幅 (Marquee Tile)** | `1400×560` PNG (可选) | ⬜ 可选 | 首页横幅位展示 |

---

## 3. 权限申辩词 (Permissions Justification) [审查核心！]

> **非常重要**：Chrome 审查团队极其注重权限合理性。绝不能写 "Needed to work"，请直接复制以下官方审核申述词：

| 权限名称 (Permission) | 类型 | 官方审核申述理由 (Justification for Reviewers) |
| :--- | :--- | :--- |
| `storage` | `permissions` | Used to save user's subtitle styling preferences (font size, position, colors) and caching downloaded subtitle cues locally for fast recovery on page refresh. |
| `unlimitedStorage` | `permissions` | Required to store parsed subtitle cues locally for long TV series without hitting the default storage quota. |
| `activeTab` | `permissions` | Allows the extension popup to inspect the current Netflix playback time and trigger subtitle matching when the user opens the extension menu. |
| `tabs` | `permissions` | Used solely to find the active Netflix tab ID and URL when the popup opens, allowing seamless bi-directional communication with the player. |
| `scripting` | `permissions` | Injects the non-intrusive metadata bridge into the Netflix player frame to reliably detect official video titles for accurate subtitle searching. |
| `*://*.netflix.com/*` | `host_permissions` | Required to overlay custom subtitles over the Netflix HTML5 video player and synchronize cues with video playback timestamps. |
| `https://api.subdl.com/*` | `host_permissions` | Enables querying community-contributed subtitle metadata for movies and series based on user requests. |
| `https://dl.subdl.com/*` | `host_permissions` | Downloads the user-selected subtitle files (.srt/.zip) directly from SubDL servers. |
| `https://api.opensubtitles.com/*` | `host_permissions` | Connects to OpenSubtitles REST API to search and retrieve multilingual subtitle files. |
| `https://translate.googleapis.com/*` | `host_permissions` | Performs client-side automated machine translation to generate bilingual paired subtitles when only monolingual foreign subtitles are available. |
| `https://*.yts-subs.com/*` | `host_permissions` | Public backup provider to query and retrieve movie subtitle archives. |

---

## 4. 隐私与数据合规 (Privacy & Data Usage)

在控制台的「隐私权规范 (Privacy Practices)」页面勾选：

### 数据收集声明 (Data Collection)
- **是否收集用户数据？**：选择 **`No, I do not collect user data`** (否，本扩展不收集任何用户数据)。
- 勾选以下三项保证承诺：
  - [x] 不会向第三方出售用户数据 (Data is not sold to third parties)
  - [x] 不会将数据用于与核心功能无关的目的 (Data is not used for unrelated purposes)
  - [x] 不会将数据用于信用评估或贷款目的 (Data is not used for creditworthiness)

---

## 5. 隐私政策范本 (Privacy Policy) [必填]

> **提示**：Chrome 商店要求必须提供一个公网可访问的 `Privacy Policy URL`。你可以将以下内容复制并在 **GitHub Gist**、**Notion 公开页面** 或你的博客上发布，然后将链接填入后台。

```markdown
# Privacy Policy for Netflix External Subtitle Overlay

Last updated: October 1, 2026

Netflix External Subtitle Overlay ("we", "our", or "the extension") is committed to protecting your privacy.

1. Information We Do Not Collect
- We do not collect, store, transmit, or sell any personal information, browsing history, Netflix account credentials, or watch history.
- The extension operates entirely within your local browser.

2. Local Storage
- The extension uses `chrome.storage.local` exclusively on your device to remember your subtitle appearance preferences (such as font size, font color, position) and to temporarily cache subtitle files you have loaded, enabling faster loading and offline persistence.
- This data never leaves your device.

3. External Network Requests
- When you use the auto-search or subtitle search features, the extension sends search queries (containing only the media title, season, and episode number) to external subtitle providers (SubDL, OpenSubtitles) and translation endpoints to fetch subtitles.
- No personally identifiable information or user identifiers are included in these requests.

4. Third-Party Services
- The extension interacts with third-party subtitle providers only when explicitly requested to fetch subtitles. We encourage users to review the privacy policies of those respective services.

5. Contact
If you have questions about this privacy policy, please open an issue on our project repository.
```

---

## 6. 其他发布渠道推荐

除了 Chrome Web Store，本扩展同样兼容以下平台：
1. **Edge Add-ons (微软应用商店)**：
   - 开发者注册完全免费！
   - 后台直接使用相同的 `dist/netflix-subtitle-overlay.zip` 与本清单文案，通常 24 小时内过审。
   - 官网入口：[Microsoft Edge Partner Center](https://partner.microsoft.com/dashboard/microsoftedge)
2. **GitHub Release (开源离线分发)**：
   - 将 `dist/netflix-subtitle-overlay.zip` 发布在 GitHub Releases，用户下载解压后在 `chrome://extensions/` 勾选开发者模式，点击「加载已解压的扩展程序」即可使用。
