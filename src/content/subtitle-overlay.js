/**
 * SubtitleOverlay - Shadow DOM Subtitle and HUD display layer
 * 
 * Features:
 * - Isolated Open Shadow DOM to prevent Netflix CSS interference
 * - Responsive typography and cinematic text styling
 * - Dynamic positioning (supports bottom, middle, top)
 * - HUD Toast for real-time offset synchronization feedback
 * - Auto re-attachment on Netflix DOM reconstruction or Fullscreen changes
 */

class SubtitleOverlay {
  constructor() {
    this.host = null;
    this.shadow = null;
    this.textElement = null;
    this.hudElement = null;
    this.containerElement = null;
    this.hudTimeout = null;
    this.mutationObserver = null;
    this.currentText = '';

    this.settings = {
      enabled: true,
      fontSize: 28,
      position: 'bottom',
      showBackground: true
    };

    this.boundHandleFullscreen = this.handleFullscreenChange.bind(this);
    this.boundCheckAttachment = this.checkAttachment.bind(this);
  }

  /**
   * Initialize and mount the overlay into Netflix DOM
   */
  mount() {
    if (this.host && document.contains(this.host)) {
      return;
    }

    this.createDom();
    this.attachToBestContainer();

    if (typeof StorageAdapter !== 'undefined' && StorageAdapter.getSettings) {
      StorageAdapter.getSettings().then(settings => {
        if (settings) {
          this.applySettings(settings);
        }
      });
    }

    // Listen to fullscreen changes
    document.addEventListener('fullscreenchange', this.boundHandleFullscreen);
    document.addEventListener('webkitfullscreenchange', this.boundHandleFullscreen);

    // Watch DOM mutations to survive Netflix SPA player rebuilds
    if (!this.mutationObserver) {
      this.mutationObserver = new MutationObserver(() => {
        this.checkAttachment();
      });
      this.mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  destroy() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    document.removeEventListener('fullscreenchange', this.boundHandleFullscreen);
    document.removeEventListener('webkitfullscreenchange', this.boundHandleFullscreen);

    if (this.host && this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
    this.host = null;
    this.shadow = null;
  }

  createDom() {
    if (this.host) return;

    this.host = document.createElement('div');
    this.host.id = 'external-subtitle-root';
    this.host.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483647; overflow: hidden;';

    this.shadow = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        pointer-events: none;
        --sub-font-size: 28px;
        --sub-text-color: #ffffff;
        --sub-secondary-color: rgba(255, 255, 255, 0.88);
        --sub-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
        --sub-bottom-offset: 8%;
      }
      *, *::before, *::after {
        box-sizing: border-box;
      }
      .overlay-viewport {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        align-items: center;
        padding-bottom: var(--sub-bottom-offset);
        transition: padding 0.15s ease, justify-content 0.15s ease;
      }
      .overlay-viewport.pos-middle {
        justify-content: center;
        padding-bottom: 0 !important;
        padding-top: 0 !important;
      }
      .overlay-viewport.pos-top {
        justify-content: flex-start;
        padding-top: var(--sub-bottom-offset);
        padding-bottom: 0 !important;
      }
      .subtitle-box {
        max-width: 88%;
        text-align: center;
        pointer-events: none;
        user-select: none;
        display: none;
      }
      .subtitle-box.has-content {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
      }
      .subtitle-text {
        font-family: var(--sub-font-family);
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 6px 18px;
        border-radius: 8px;
        transition: all 0.15s ease;
      }
      .sub-line {
        white-space: pre-line;
        text-align: center;
        letter-spacing: 0.3px;
        word-break: break-word;
      }
      .sub-primary {
        font-size: var(--sub-font-size);
        color: var(--sub-text-color);
        font-weight: 700;
        line-height: 1.32;
      }
      .sub-secondary {
        font-size: calc(var(--sub-font-size) * 0.78);
        color: var(--sub-secondary-color);
        font-weight: 500;
        line-height: 1.32;
        margin-top: 4px;
      }
      /* Preset 1: Pill (Semi-transparent dark backdrop pill) */
      .preset-pill {
        background: rgba(0, 0, 0, 0.76);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }
      .preset-pill .sub-line {
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
      }
      /* Preset 2: Outline (Cinema transparent backdrop with strong multi-layer stroke) */
      .preset-outline {
        background: transparent;
      }
      .preset-outline .sub-line {
        text-shadow:
          -2px -2px 0 #000,
           2px -2px 0 #000,
          -2px  2px 0 #000,
           2px  2px 0 #000,
          -1px -1px 0 #000,
           1px -1px 0 #000,
          -1px  1px 0 #000,
           1px  1px 0 #000,
           0px  3px 6px rgba(0, 0, 0, 0.95);
      }
      /* Preset 3: Cinema (Solid dark box) */
      .preset-cinema {
        background: rgba(0, 0, 0, 0.93);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.15);
      }
      .preset-cinema .sub-line {
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
      }
      .hud-toast {
        position: absolute;
        top: 24px;
        right: 28px;
        background: rgba(18, 18, 22, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: #ffffff;
        padding: 10px 18px;
        border-radius: 30px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.3px;
        display: flex;
        align-items: center;
        gap: 8px;
        opacity: 0;
        transform: translateY(-8px) scale(0.96);
        transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: none;
        z-index: 10;
      }
      .hud-toast.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .hud-icon {
        color: #E50914;
        font-size: 16px;
      }
    `;

    this.shadow.appendChild(style);

    this.containerElement = document.createElement('div');
    this.containerElement.className = 'overlay-viewport';

    const subBox = document.createElement('div');
    subBox.className = 'subtitle-box';

    this.textElement = document.createElement('div');
    this.textElement.id = 'external-subtitle-text';
    this.textElement.className = 'subtitle-text font-medium bg-pill';

    subBox.appendChild(this.textElement);
    this.containerElement.appendChild(subBox);

    this.hudElement = document.createElement('div');
    this.hudElement.id = 'external-hud-toast';
    this.hudElement.className = 'hud-toast';
    this.hudElement.innerHTML = `<span class="hud-icon">⏱</span><span class="hud-text"></span>`;

    this.shadow.appendChild(this.containerElement);
    this.shadow.appendChild(this.hudElement);

    this.applySettings(this.settings);
  }

  attachToBestContainer() {
    if (!this.host) return;

    // Candidates in order of preference
    const fullscreenEl = document.fullscreenElement || document.webkitFullscreenElement;
    const video = document.querySelector('video');

    let target = null;

    if (fullscreenEl) {
      target = fullscreenEl;
    } else if (video) {
      // Find player container across Netflix, Prime Video, Crave, Disney+, Max, YouTube, Apple TV+, etc.
      target = video.closest('.watch-video--player-view') || // Netflix
               video.closest('.NFPlayer') ||
               video.closest('.nf-player-container') ||
               video.closest('.webPlayerContainer') ||        // Prime Video
               video.closest('#dv-web-player') ||
               video.closest('.atvwebplayersdk-player-container') ||
               video.closest('.dv-player-fullscreen') ||
               video.closest('.btm-media-player') ||         // Crave & Disney+
               video.closest('.crave-player-container') ||
               video.closest('#movie_player') ||             // YouTube
               video.closest('.html5-video-player') ||
               video.closest('[data-testid="player-container"]') || // Max & Disney+
               video.closest('.playback-container') ||       // Apple TV+
               video.closest('#bilibili-player') ||          // Bilibili
               video.closest('[class*="player-container"]') ||
               video.closest('[class*="VideoPlayer"]') ||
               video.parentElement;
    } else {
      target = document.querySelector('.watch-video--player-view') ||
               document.querySelector('.webPlayerContainer') ||
               document.querySelector('#dv-web-player') ||
               document.querySelector('.btm-media-player') ||
               document.querySelector('#movie_player') ||
               document.body;
    }

    if (target && this.host.parentNode !== target) {
      // Ensure target has position relative/absolute
      const style = window.getComputedStyle(target);
      if (style.position === 'static' && target !== document.body) {
        target.style.position = 'relative';
      }
      target.appendChild(this.host);
    }
  }

  checkAttachment() {
    if (!this.host || !document.contains(this.host)) {
      this.attachToBestContainer();
    }
  }

  handleFullscreenChange() {
    setTimeout(() => {
      this.attachToBestContainer();
    }, 50);
  }

  /**
   * Escape HTML to safely render inside Shadow DOM
   */
  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Render subtitle text to overlay with bilingual line styling and displayMode support
   * @param {string} text
   * @param {boolean} force
   */
  renderText(text, force = false) {
    if (!this.textElement) return;

    if (this.settings.enabled === false) {
      this.textElement.innerHTML = '';
      if (this.textElement.parentElement) {
        this.textElement.parentElement.classList.remove('has-content');
      }
      return;
    }

    const trimmed = (text || '').trim();
    this.rawCurrentText = trimmed;

    if (!force && trimmed === this.currentText) return;
    this.currentText = trimmed;

    const subBox = this.textElement.parentElement;

    if (!trimmed) {
      this.textElement.innerHTML = '';
      subBox.classList.remove('has-content');
    } else {
      const lines = trimmed.split('\n').filter(l => l.trim().length > 0);
      const mode = this.settings.displayMode || 'bilingual_zh_en';

      if (lines.length >= 2) {
        if (mode === 'target_only') {
          // Monolingual: only primary target line (Chinese)
          this.textElement.innerHTML = `<div class="sub-line sub-primary">${this.escapeHtml(lines[0])}</div>`;
        } else if (mode === 'bilingual_en_zh') {
          // Bilingual: English on top (primary), Chinese on bottom (secondary)
          this.textElement.innerHTML = `
            <div class="sub-line sub-primary">${this.escapeHtml(lines.slice(1).join('\n'))}</div>
            <div class="sub-line sub-secondary">${this.escapeHtml(lines[0])}</div>
          `;
        } else {
          // Default: bilingual_zh_en - Chinese on top (primary), English on bottom (secondary)
          this.textElement.innerHTML = `
            <div class="sub-line sub-primary">${this.escapeHtml(lines[0])}</div>
            <div class="sub-line sub-secondary">${this.escapeHtml(lines.slice(1).join('\n'))}</div>
          `;
        }
      } else {
        this.textElement.innerHTML = `<div class="sub-line sub-primary">${this.escapeHtml(trimmed)}</div>`;
      }
      subBox.classList.add('has-content');
    }
  }

  /**
   * Display HUD toast notification (e.g. Subtitle offset: +0.7 s)
   * @param {string} message
   */
  showHud(message) {
    if (!this.hudElement) return;

    const hudText = this.hudElement.querySelector('.hud-text');
    if (hudText) {
      hudText.textContent = message;
    }

    this.hudElement.classList.add('visible');

    if (this.hudTimeout) {
      clearTimeout(this.hudTimeout);
    }

    this.hudTimeout = setTimeout(() => {
      if (this.hudElement) {
        this.hudElement.classList.remove('visible');
      }
      this.hudTimeout = null;
    }, 1500);
  }

  /**
   * Apply user settings (fontSize, position, stylePreset, fontFamily, textColor, bottomOffset)
   * Real-time reactive updates directly into Shadow DOM
   * @param {Object} settings
   */
  applySettings(settings) {
    if (!settings) return;
    this.settings = { ...this.settings, ...settings };

    if (this.host) {
      const isEnabled = this.settings.enabled !== false;
      this.host.style.display = isEnabled ? 'block' : 'none';
      if (!isEnabled && this.textElement) {
        this.textElement.innerHTML = '';
        if (this.textElement.parentElement) {
          this.textElement.parentElement.classList.remove('has-content');
        }
        return;
      }
    }

    if (!this.containerElement || !this.textElement || !this.host) return;

    // 1. Font Size (px)
    let sizePx = 28;
    if (typeof this.settings.fontSize === 'number') {
      sizePx = this.settings.fontSize;
    } else if (this.settings.fontSize === 'small') {
      sizePx = 22;
    } else if (this.settings.fontSize === 'large') {
      sizePx = 36;
    } else if (parseInt(this.settings.fontSize, 10)) {
      sizePx = parseInt(this.settings.fontSize, 10);
    }
    this.host.style.setProperty('--sub-font-size', `${sizePx}px`);

    // 2. Text Color
    const textColor = this.settings.textColor || '#ffffff';
    this.host.style.setProperty('--sub-text-color', textColor);

    // 3. Font Family
    let family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
    if (this.settings.fontFamily === 'serif') {
      family = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, Georgia, serif';
    } else if (this.settings.fontFamily === 'rounded') {
      family = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Comic Sans MS", cursive, sans-serif';
    } else if (this.settings.fontFamily === 'monospace') {
      family = 'Consolas, "Courier New", monospace';
    }
    this.host.style.setProperty('--sub-font-family', family);

    // 4. Vertical Position & Bottom Offset
    const bOffset = typeof this.settings.bottomOffset === 'number' ? this.settings.bottomOffset : 8;
    this.host.style.setProperty('--sub-bottom-offset', `${bOffset}%`);

    this.containerElement.classList.remove('pos-middle', 'pos-top');
    if (this.settings.position === 'middle') {
      this.containerElement.classList.add('pos-middle');
    } else if (this.settings.position === 'top') {
      this.containerElement.classList.add('pos-top');
    }

    // 5. Style Preset
    this.textElement.classList.remove('preset-pill', 'preset-outline', 'preset-cinema', 'bg-pill');
    let preset = this.settings.stylePreset;
    if (!preset) {
      preset = this.settings.showBackground === false ? 'outline' : 'pill';
    }
    this.textElement.classList.add(`preset-${preset}`);

    // Re-render currently displayed text with new styling and displayMode
    if (this.rawCurrentText) {
      const activeText = this.rawCurrentText;
      this.currentText = '';
      this.renderText(activeText, true);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SubtitleOverlay };
}
if (typeof globalThis !== 'undefined') {
  globalThis.SubtitleOverlay = SubtitleOverlay;
}
