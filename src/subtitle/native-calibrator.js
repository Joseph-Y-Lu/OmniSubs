/**
 * NativeSubtitleCalibrator - Automatic Timeline Alignment using Native Platform Captions
 * 
 * Specifically addresses:
 * - Streaming ads (Prime Video ad-tiers, Crave commercials, Hulu ad-breaks) that shift video clock
 * - Release edition timing differences (intro recaps, studio logos, 23.976fps vs 24fps vs 25fps)
 * 
 * Mechanism:
 * 1. Passively monitors video native CC from both TextTracks (video.textTracks) and DOM caption containers.
 * 2. Compares active native caption text against loaded external subtitle cues (using normalized fuzzy matching).
 * 3. When a high-confidence match is detected (similarity >= 0.70):
 *    - Computes exact offset delta = (cue.start - video.currentTime).
 *    - If the delta differs from current engine offset by > 0.4s:
 *      Automatically calibrates the SubtitleEngine offset to align external subtitles frame-accurately!
 * 4. Displays real-time HUD notification and persists sync state.
 */

class NativeSubtitleCalibrator {
  static NATIVE_SELECTORS = [
    // Crave (Bitmovin Player & custom UI)
    '.bmpui-ui-subtitle-overlay span',
    '.bmpui-subtitle-region span',
    '.bmpui-subtitle-label',
    '.bmpui-ui-subtitle-overlay div',
    '[class*="bmpui-subtitle"]',
    '.btm-media-player-captions',
    '.btm-media-player .captions-container',
    // Amazon Prime Video
    '.atvwebplayersdk-captions-text',
    '[data-automation-id="captions"]',
    '.timed-text-container',
    'div[class*="atvwebplayersdk-captions"]',
    // Netflix
    '.player-timedtext-text-container',
    '.player-timedtext',
    // Disney+
    '.dplus-caption-window',
    'div[class*="caption-container"]',
    'div[class*="caption-window"]',
    // YouTube
    '.ytp-caption-segment',
    '.caption-window',
    // Shaka / Video.js / Universal players
    '.shaka-text-container span',
    '.vjs-text-track-display .vjs-text-track-cue',
    '[class*="closed-caption"]:not([class*="button"]):not([class*="control"]):not([class*="toggle"])',
    '[class*="timedtext"]:not([class*="button"]):not([class*="control"])'
  ];

  static isValidCaptionText(rawText) {
    if (!rawText || typeof rawText !== 'string') return false;
    const text = rawText.trim();
    if (text.length < 2 || text.length > 300) return false;

    // Filter out episode / season identifiers like "S1 E1: The Hedge Knight", "Season 1, Ep 1", "S01E01"
    if (/^s\d+\s*e\d+/i.test(text) || /^season\s*\d+/i.test(text) || /^episode\s*\d+/i.test(text) || /^第\s*\d+\s*[季集]/i.test(text)) {
      return false;
    }
    // Filter out pure UI controls, timestamps, video info
    if (/^(?:play|pause|mute|unmute|replay|skip|next|episodes|audio|subtitles|cc|hd|4k|1080p|volume|\d{1,2}:\d{2})$/i.test(text)) {
      return false;
    }
    return true;
  }

  constructor(engine, videoController, overlay) {
    this.engine = engine;
    this.videoController = videoController;
    this.overlay = overlay;
    this.enabled = true;
    this.observer = null;
    this.lastSample = { text: '', time: 0 };
    this.lastCalibratedTime = 0;
    this.recentDeltas = [];

    this.boundCheckDomCaptions = this.checkDomCaptions.bind(this);
    this.boundHandleCueChange = this.handleCueChange.bind(this);
  }

  /**
   * Start passive monitoring of native captions
   */
  start() {
    this.stop();

    if (typeof document !== 'undefined') {
      // 1. Observe DOM caption containers
      this.observer = new MutationObserver(() => {
        if (!this.enabled) return;
        this.checkDomCaptions();
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    // 2. Observe HTML5 video textTracks if available
    this.attachTextTracks();

    // Re-check periodically when video is playing
    this.pollInterval = setInterval(() => {
      if (this.enabled) {
        this.checkDomCaptions();
        this.attachTextTracks();
      }
    }, 1500);
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  extractTextFromTextTracks() {
    const video = this.videoController?.videoElement || (typeof document !== 'undefined' ? document.querySelector('video') : null);
    if (!video || !video.textTracks || video.textTracks.length === 0) return '';

    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      if (track.mode === 'disabled') {
        try {
          track.mode = 'hidden';
        } catch (e) {}
      }
      // 1. Check activeCues
      if (track.activeCues && track.activeCues.length > 0) {
        for (let j = 0; j < track.activeCues.length; j++) {
          const cue = track.activeCues[j];
          const text = (cue.text || (typeof cue.getCueAsHTML === 'function' ? cue.getCueAsHTML()?.textContent : '') || '').trim();
          if (text && NativeSubtitleCalibrator.isValidCaptionText(text)) {
            return text;
          }
        }
      }
      // 2. Check cues matching current video time
      if (track.cues && track.cues.length > 0) {
        const vTime = video.currentTime !== undefined ? video.currentTime : 0;
        for (let j = 0; j < track.cues.length; j++) {
          const cue = track.cues[j];
          if (cue.startTime <= vTime && vTime <= cue.endTime) {
            const text = (cue.text || (typeof cue.getCueAsHTML === 'function' ? cue.getCueAsHTML()?.textContent : '') || '').trim();
            if (text && NativeSubtitleCalibrator.isValidCaptionText(text)) {
              return text;
            }
          }
        }
      }
    }
    return '';
  }

  extractCurrentNativeText() {
    const video = this.videoController?.videoElement || (typeof document !== 'undefined' ? document.querySelector('video') : null);

    // Priority 1: Check HTML5 video textTracks (cleanest source)
    const trackText = this.extractTextFromTextTracks();
    if (trackText && NativeSubtitleCalibrator.isValidCaptionText(trackText)) {
      return trackText;
    }

    // Priority 2: Check DOM caption overlays
    if (typeof document !== 'undefined') {
      for (const sel of NativeSubtitleCalibrator.NATIVE_SELECTORS) {
        try {
          const elements = document.querySelectorAll(sel);
          for (const el of elements) {
            if (el.closest && el.closest('.bmpui-ui-controlbar, .player-controls, header, nav, [class*="control-bar"], [class*="header"], [class*="title-bar"]')) {
              continue;
            }
            const text = (el.textContent || el.innerText || '').trim();
            if (text && NativeSubtitleCalibrator.isValidCaptionText(text)) {
              return text;
            }
          }
        } catch (e) {}
      }
    }

    // Priority 3: Spatial Visual Detection (detect visible text floating over the bottom of the video)
    if (video) {
      const visualText = NativeSubtitleCalibrator.findVisibleCaptionOverVideo(video);
      if (visualText && NativeSubtitleCalibrator.isValidCaptionText(visualText)) {
        return visualText;
      }
    }

    return '';
  }

  static findVisibleCaptionOverVideo(video) {
    if (!video || typeof document === 'undefined') return '';
    try {
      const vRect = video.getBoundingClientRect();
      if (!vRect || vRect.width === 0 || vRect.height === 0) return '';

      const playerContainer = video.closest('.player-container, .btm-media-player, .webPlayerContainer, #dv-web-player, [class*="player"], body') || document.body;
      const candidates = playerContainer.querySelectorAll('span, div, p');

      for (const el of candidates) {
        if (el.id === 'external-subtitle-root' || el.closest('#external-subtitle-root')) continue;
        if (el.closest('button, [role="button"], input, .bmpui-ui-controlbar, [class*="control-bar"], [class*="header"], [class*="title"], [class*="metadata"], [class*="scrubber"]')) {
          continue;
        }

        const text = (el.textContent || el.innerText || '').trim();
        if (!text || text.length < 2 || text.length > 250) continue;
        if (!NativeSubtitleCalibrator.isValidCaptionText(text)) continue;

        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) continue;

        if (typeof window !== 'undefined' && window.getComputedStyle) {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
        }

        // Element must overlap with video and be in the lower 60% of the video frame
        const isOverVideo = (
          rect.top >= (vRect.top - 10) &&
          rect.bottom <= (vRect.bottom + 40) &&
          rect.left >= (vRect.left - 20) &&
          rect.right <= (vRect.right + 20)
        );

        const isInLowerHalf = rect.top >= (vRect.top + vRect.height * 0.35);

        if (isOverVideo && isInLowerHalf) {
          const hasLeafChild = Array.from(el.children).some(c => (c.textContent || '').trim() === text);
          if (!hasLeafChild) {
            return text;
          }
        }
      }
    } catch (err) {}
    return '';
  }

  attachTextTracks() {
    const video = this.videoController?.videoElement || (typeof document !== 'undefined' ? document.querySelector('video') : null);
    if (!video || !video.textTracks) return;

    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      if (!track._omniListening) {
        track._omniListening = true;
        track.addEventListener('cuechange', () => this.handleCueChange(track, video));
      }
    }
  }

  handleCueChange(track, video) {
    if (!this.enabled || !track || !track.activeCues || track.activeCues.length === 0) return;
    const active = track.activeCues[0];
    const text = (active.text || (typeof active.getCueAsHTML === 'function' ? active.getCueAsHTML()?.textContent : '') || '').trim();
    if (text && NativeSubtitleCalibrator.isValidCaptionText(text)) {
      const currentTime = video?.currentTime !== undefined ? video.currentTime : this.videoController?.getCurrentTime();
      this.processSample(text, currentTime);
    }
  }

  checkDomCaptions() {
    if (!this.enabled) return;
    const text = this.extractCurrentNativeText();
    if (text) {
      const currentTime = this.videoController?.getCurrentTime() || 0;
      this.processSample(text, currentTime);
    }
  }

  /**
   * Normalize text for robust fuzzy comparison
   */
  static normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      // Remove HTML tags like <i>, <b>, <font ...>
      .replace(/<[^>]+>/g, ' ')
      // Remove sound effect annotations like [music], (applause), ♪♪, 【掌声】, （叹气）, etc.
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/\([^\)]+\)/g, ' ')
      .replace(/【[^】]+】/g, ' ')
      .replace(/（[^）]+）/g, ' ')
      .replace(/[♪♫#\-_*]+/g, ' ')
      // Keep alphanumeric and CJK characters
      .replace(/[^\w\s\u4e00-\u9fa5]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate string similarity score between 0.0 and 1.0
   */
  static calculateSimilarity(str1, str2) {
    const s1 = this.normalizeText(str1);
    const s2 = this.normalizeText(str2);
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1.0;

    // Substring containment match
    if (s1.includes(s2) || s2.includes(s1)) {
      const minLen = Math.min(s1.length, s2.length);
      const maxLen = Math.max(s1.length, s2.length);
      if (minLen / maxLen >= 0.5) return 0.92;
      if (minLen >= 8) return 0.85;
    }

    // Word token overlap (Jaccard + Overlap score)
    const tokens1 = s1.split(' ').filter(t => t.length > 1);
    const tokens2 = s2.split(' ').filter(t => t.length > 1);
    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    let intersection = 0;
    set1.forEach(t => {
      if (set2.has(t)) intersection++;
    });

    const union = new Set([...set1, ...set2]).size;
    const jaccard = union > 0 ? (intersection / union) : 0;
    const overlap = Math.max(intersection / set1.size, intersection / set2.size);
    return Math.max(jaccard, overlap * 0.85);
  }

  /**
   * Process a captured native caption sample
   * @param {string} rawText
   * @param {number} currentTime
   */
  processSample(rawText, currentTime) {
    if (!rawText || isNaN(currentTime) || currentTime <= 0) return;
    const clean = NativeSubtitleCalibrator.normalizeText(rawText);
    if (clean.length < 3) return;

    // Deduplicate rapid repeat samples within 1.0s
    const now = Date.now();
    if (this.lastSample.text === clean && (now - this.lastSample.time) < 1000) {
      return;
    }
    this.lastSample = { text: clean, time: now };

    // Don't auto-recalibrate more than once every 8 seconds unless a massive jump occurs
    if (now - this.lastCalibratedTime < 8000) {
      return;
    }

    const match = this.findMatchingCue(clean, currentTime);
    if (match && match.score >= 0.70) {
      this.applyCalibration(match, currentTime);
    }
  }

  /**
   * Search loaded cues for best matching text
   * @param {string} nativeText
   * @param {number} currentTime
   * @returns {{ cue: Object, score: number }|null}
   */
  findMatchingCue(nativeText, currentTime) {
    if (!this.engine || !this.engine.cues || this.engine.cues.length === 0) {
      return null;
    }

    const currentOffset = this.engine.getOffset();
    const effectiveTime = this.engine.getEffectiveTime(currentTime);

    // Search window: within ±15 minutes (900s) to comfortably catch commercial ad breaks
    const searchRadius = 900;
    let candidates = this.engine.cues.filter(c => Math.abs(c.start - effectiveTime) <= searchRadius);
    if (candidates.length === 0) {
      candidates = this.engine.cues;
    }

    let bestMatch = null;
    let highestScore = 0;

    for (const cue of candidates) {
      // 1. Check originalText (preserved from translation source)
      if (cue.originalText) {
        const score = NativeSubtitleCalibrator.calculateSimilarity(nativeText, cue.originalText);
        if (score > highestScore) {
          highestScore = score;
          bestMatch = { cue, score };
        }
      }

      // 2. Check full cue.text (handles monolingual or bilingual line matching)
      if (cue.text) {
        const lines = cue.text.split('\n');
        for (const line of lines) {
          const score = NativeSubtitleCalibrator.calculateSimilarity(nativeText, line);
          if (score > highestScore) {
            highestScore = score;
            bestMatch = { cue, score };
          }
        }
      }

      if (highestScore >= 0.95) break; // Early exit on near-perfect match
    }

    return bestMatch;
  }

  /**
   * Apply calculated offset to SubtitleEngine
   */
  applyCalibration(match, videoTime) {
    const { cue, score } = match;
    const expectedSubTime = cue.start;
    // videoTime + newOffset = expectedSubTime -> newOffset = expectedSubTime - videoTime
    const newOffset = Math.round((expectedSubTime - videoTime) * 10) / 10;
    const currentOffset = Math.round(this.engine.getOffset() * 10) / 10;
    const drift = Math.abs(newOffset - currentOffset);

    // Only apply if drift is noticeable (> 0.4s) to prevent jitter on tiny sub-frame differences
    if (drift >= 0.4 && drift < 900) {
      console.log(`[NativeCalibrator] Ad/sync offset detected! Calibrating: ${currentOffset}s -> ${newOffset}s (drift: ${drift.toFixed(1)}s, score: ${(score * 100).toFixed(0)}%)`);
      this.engine.setOffset(newOffset);
      this.engine.update(videoTime, true);
      this.lastCalibratedTime = Date.now();

      const delta = newOffset - currentOffset;
      const sign = delta > 0 ? '+' : '';
      if (this.overlay && this.overlay.showHud) {
        this.overlay.showHud(`🎯 广告/切片时间轴已自动校准: ${sign}${delta.toFixed(1)}s (当前偏移: ${newOffset >= 0 ? '+' : ''}${newOffset.toFixed(1)}s)`);
      }

      if (typeof this.onCalibrated === 'function') {
        this.onCalibrated({
          oldOffset: currentOffset,
          newOffset,
          delta,
          cue,
          score
        });
      }
    }
  }

  /**
   * Manual trigger to inspect current visible native captions and calibrate immediately
   */
  manualCalibrate() {
    const currentTime = this.videoController?.getCurrentTime() || 0;
    const foundText = this.extractCurrentNativeText();

    if (!foundText) {
      return { 
        success: false, 
        message: '未检测到视频当前的原生字幕。请确保播放器内置字幕处于开启状态（如开启英文字幕），并在角色说话有字幕显示时点击校准。' 
      };
    }

    if (!this.engine || !this.engine.cues || this.engine.cues.length === 0) {
      if (foundText) {
        return {
          success: false,
          hasNativeText: true,
          foundText,
          message: `已成功捕获当前视频自带台词「${foundText.replace(/\n/g, ' ')}」，但当前尚未装载外挂字幕！请先在弹窗上方确认片名并加载字幕后再校准。`
        };
      }
      return {
        success: false,
        message: '当前尚未装载外挂字幕！请先点击面板上方的「⚡ 确认片名并自动加载字幕」或在「搜索/本地」中加载字幕文件后再校准。'
      };
    }

    const clean = NativeSubtitleCalibrator.normalizeText(foundText);
    const match = this.findMatchingCue(clean, currentTime);
    if (!match || match.score < 0.60) {
      return { 
        success: false, 
        message: `已捕获原生字幕「${foundText.replace(/\n/g, ' ')}」，但在当前外挂字幕（共 ${this.engine.cues.length} 句）中暂未找到相符台词。建议在对白清晰时再次点击。` 
      };
    }

    const expectedSubTime = match.cue.start;
    const newOffset = Math.round((expectedSubTime - currentTime) * 10) / 10;
    const oldOffset = this.engine.getOffset();
    this.engine.setOffset(newOffset);
    this.engine.update(currentTime, true);

    const delta = newOffset - oldOffset;
    return {
      success: true,
      oldOffset,
      newOffset,
      delta,
      matchedText: match.cue.text,
      score: match.score
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NativeSubtitleCalibrator };
}
if (typeof globalThis !== 'undefined') {
  globalThis.NativeSubtitleCalibrator = NativeSubtitleCalibrator;
}
