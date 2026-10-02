/**
 * SubtitleEngine - Central clock synchronization and cue matching engine
 * 
 * Master clock principle:
 * Uses HTMLMediaElement.currentTime as the ONLY source of truth.
 * No independent drift timers. Pause, resume, seek, rewind, fast-forward,
 * and playback rate changes naturally stay in sync.
 */

class SubtitleEngine {
  constructor() {
    this.cues = [];
    this.offset = 0.0; // Offset in seconds (video.currentTime + offset = subtitleTime)
    this.timeScale = 1.0; // Calibration factor 'a' for two-point drift correction: a * t + b
    this.lastRenderedText = null;
    this.changeListeners = [];
    this.metadata = null;
  }

  /**
   * Load parsed cues into engine
   * @param {Array<{id: number, start: number, end: number, text: string}>} cues
   * @param {Object} [metadata]
   */
  loadCues(cues, metadata = {}) {
    if (!Array.isArray(cues)) {
      this.cues = [];
    } else {
      // Ensure sorted by start time
      this.cues = [...cues].sort((a, b) => a.start - b.start);
    }
    this.metadata = metadata;
    this.lastRenderedText = null;
  }

  /**
   * Clear all active cues
   */
  clear() {
    this.cues = [];
    this.metadata = null;
    this.lastRenderedText = null;
    this.notifyChange('', []);
  }

  /**
   * Set absolute offset in seconds
   * @param {number} seconds
   */
  setOffset(seconds) {
    this.offset = Math.round((parseFloat(seconds) || 0) * 1000) / 1000;
  }

  /**
   * Adjust offset by a delta in seconds (+0.1, -0.1, +1.0, etc.)
   * @param {number} deltaSeconds
   * @returns {number} new offset
   */
  adjustOffset(deltaSeconds) {
    this.offset = Math.round((this.offset + (parseFloat(deltaSeconds) || 0)) * 1000) / 1000;
    return this.offset;
  }

  /**
   * Get current offset in seconds
   * @returns {number}
   */
  getOffset() {
    return this.offset;
  }

  /**
   * Calculate effective subtitle time from video master clock
   * Formula: effectiveTime = a * videoTime + b
   * @param {number} videoTime
   * @returns {number}
   */
  getEffectiveTime(videoTime) {
    return this.timeScale * videoTime + this.offset;
  }

  /**
   * Calibrate using two points: (videoTime1, subTime1) and (videoTime2, subTime2)
   * Solves:
   * subTime1 = a * videoTime1 + b
   * subTime2 = a * videoTime2 + b
   * @param {{videoTime: number, subTime: number}} p1
   * @param {{videoTime: number, subTime: number}} p2
   */
  calibrateTwoPoints(p1, p2) {
    if (Math.abs(p2.videoTime - p1.videoTime) < 0.001) return;
    this.timeScale = (p2.subTime - p1.subTime) / (p2.videoTime - p1.videoTime);
    this.offset = p1.subTime - this.timeScale * p1.videoTime;
  }

  /**
   * Find active cues for the given video current time
   * @param {number} videoCurrentTime
   * @returns {Array<{id: number, start: number, end: number, text: string}>}
   */
  getActiveCues(videoCurrentTime) {
    if (!this.cues || this.cues.length === 0 || typeof videoCurrentTime !== 'number') {
      return [];
    }

    const targetTime = this.getEffectiveTime(videoCurrentTime);
    const active = [];

    // Since cues may overlap, find range via binary search or linear scan
    // For typical subtitle sizes (< 3000 cues), linear scan around binary search index or direct scan is instant (< 0.1ms)
    // Binary search to find candidate window
    let low = 0;
    let high = this.cues.length - 1;
    let startIdx = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.cues[mid].start <= targetTime) {
        startIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    // Scan backwards from startIdx to find all active cues that might have started earlier and still active
    let i = startIdx;
    while (i >= 0) {
      const cue = this.cues[i];
      if (cue.start <= targetTime && targetTime <= cue.end) {
        active.unshift(cue);
      } else if (targetTime - cue.end > 60) {
        // Stop scanning back if ended more than 60s ago
        break;
      }
      i--;
    }

    // Also scan forward just in case identical start times
    i = startIdx + 1;
    while (i < this.cues.length) {
      const cue = this.cues[i];
      if (cue.start <= targetTime && targetTime <= cue.end) {
        active.push(cue);
      } else if (cue.start > targetTime) {
        break;
      }
      i++;
    }

    return active;
  }

  /**
   * Get formatted text for active cues
   * @param {number} videoCurrentTime
   * @returns {string}
   */
  getActiveText(videoCurrentTime) {
    const activeCues = this.getActiveCues(videoCurrentTime);
    if (activeCues.length === 0) return '';
    return activeCues.map(c => c.text).join('\n');
  }

  /**
   * Update engine with current video time and notify if cue changed
   * @param {number} videoCurrentTime
   * @returns {string} currentText
   */
  update(videoCurrentTime, force = false) {
    const activeCues = this.getActiveCues(videoCurrentTime);
    const text = activeCues.map(c => c.text).join('\n');

    if (force || text !== this.lastRenderedText) {
      this.lastRenderedText = text;
      this.notifyChange(text, activeCues);
    }

    return text;
  }

  /**
   * Register listener for cue text changes
   * @param {Function} callback (text: string, activeCues: SubtitleCue[]) => void
   * @returns {Function} unregister function
   */
  onCueChange(callback) {
    this.changeListeners.push(callback);
    return () => {
      this.changeListeners = this.changeListeners.filter(cb => cb !== callback);
    };
  }

  notifyChange(text, activeCues) {
    for (let i = 0; i < this.changeListeners.length; i++) {
      try {
        this.changeListeners[i](text, activeCues);
      } catch (err) {
        console.error('[SubtitleEngine] Error in change listener:', err);
      }
    }
  }

  /**
   * Status information for UI
   */
  getStatus() {
    return {
      cuesCount: this.cues.length,
      offset: this.offset,
      timeScale: this.timeScale,
      hasSubtitles: this.cues.length > 0,
      metadata: this.metadata
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SubtitleEngine };
}
if (typeof globalThis !== 'undefined') {
  globalThis.SubtitleEngine = SubtitleEngine;
}
