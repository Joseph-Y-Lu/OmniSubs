/**
 * StorageAdapter - Manages persistent state via chrome.storage.local
 */

class StorageAdapter {
  static DEFAULT_SETTINGS = {
    enabled: true, // Master switch: when false, subtitle overlay is hidden and disabled
    fontSize: 28, // font size in px (20 - 50)
    position: 'bottom', // bottom, middle, top
    bottomOffset: 8, // vertical offset percentage (4% - 25%)
    fontFamily: 'sans-serif', // 'sans-serif', 'serif', 'rounded'
    textColor: '#ffffff', // '#ffffff', '#ffe066', '#4fc3f7', '#a7f3d0'
    stylePreset: 'pill', // 'pill' (translucent black box), 'outline' (transparent background + strong stroke), 'cinema' (solid black box)
    showBackground: true,
    rememberSubtitle: true,
    autoSearch: true, // auto-search subtitles on video play
    displayMode: 'bilingual_zh_en', // DEFAULT: Chinese on top, English on bottom!
    targetLanguage: 'zh-CN', // Default target subtitle & translation language (Simplified Chinese)
    primaryLanguage: 'zh-CN', // Backward compatibility alias for targetLanguage
    fallbackLanguage: 'zh-TW',
    autoTranslateFallback: true, // When target language subtitles are unavailable, automatically fetch original language subtitles and translate
    autoCalibrateNative: true, // Automatically calibrate timeline by detecting platform native captions (corrects for commercial ads in Prime Video, Crave, etc.)
    subdlApiKey: '',
    openSubtitlesApiKey: ''
  };

  static _memoryStore = {};

  static async get(keys) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage?.local) {
        return await new Promise((resolve) => {
          try {
            const queryKeys = keys === undefined ? null : keys;
            chrome.storage.local.get(queryKeys, (items) => {
              const err = chrome.runtime?.lastError;
              if (err) {
                resolve(this._getFromFallback(keys));
                return;
              }
              resolve(items || {});
            });
          } catch (innerErr) {
            resolve(this._getFromFallback(keys));
          }
        });
      }
    } catch (e) {
      return this._getFromFallback(keys);
    }

    return this._getFromFallback(keys);
  }

  static async set(items) {
    if (!items || typeof items !== 'object') return;
    this._memoryStore = this._memoryStore || {};
    Object.assign(this._memoryStore, items);

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage?.local) {
        return await new Promise((resolve) => {
          try {
            chrome.storage.local.set(items, () => {
              const err = chrome.runtime?.lastError;
              if (err) {
                this._setFallback(items);
                resolve();
                return;
              }
              resolve();
            });
          } catch (innerErr) {
            this._setFallback(items);
            resolve();
          }
        });
      }
    } catch (e) {
      this._setFallback(items);
      return;
    }

    this._setFallback(items);
  }

  static _getFromFallback(keys) {
    this._memoryStore = this._memoryStore || {};
    const result = {};
    const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        keyList.forEach(k => {
          try {
            const item = window.localStorage.getItem(k);
            if (item) {
              try { result[k] = JSON.parse(item); } catch (e) { result[k] = item; }
            } else if (this._memoryStore[k] !== undefined) {
              result[k] = this._memoryStore[k];
            }
          } catch (e) {}
        });
        return result;
      }
    } catch (e) {}

    keyList.forEach(k => {
      if (this._memoryStore[k] !== undefined) {
        result[k] = this._memoryStore[k];
      }
    });
    return result;
  }

  static _setFallback(items) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        Object.keys(items).forEach(k => {
          try {
            window.localStorage.setItem(k, JSON.stringify(items[k]));
          } catch (e) {}
        });
      }
    } catch (e) {}
  }

  static async getSettings() {
    const data = await this.get('settings');
    return { ...this.DEFAULT_SETTINGS, ...(data.settings || {}) };
  }

  static async saveSettings(partialSettings) {
    const current = await this.getSettings();
    const updated = { ...current, ...partialSettings };
    await this.set({ settings: updated });
    return updated;
  }

  static getMediaKey(mediaIdentity) {
    if (!mediaIdentity || !mediaIdentity.title) return '';
    const title = mediaIdentity.title.trim();
    if (mediaIdentity.type === 'tv' || mediaIdentity.season !== undefined || mediaIdentity.episode !== undefined) {
      const s = String(mediaIdentity.season || 1).padStart(2, '0');
      const e = String(mediaIdentity.episode || 1).padStart(2, '0');
      return `${title}:S${s}:E${e}`;
    }
    return title;
  }

  static async saveEpisodeSync(mediaKey, syncData) {
    if (!mediaKey) return;
    const data = await this.get('episodes');
    const episodes = data.episodes || {};
    episodes[mediaKey] = {
      ...(episodes[mediaKey] || {}),
      ...syncData,
      lastUpdated: Date.now()
    };
    await this.set({ episodes });
  }

  static async getEpisodeSync(mediaKey) {
    if (!mediaKey) return null;
    const data = await this.get('episodes');
    const episodes = data.episodes || {};
    return episodes[mediaKey] || null;
  }

  static async saveCachedTitle(videoId, title) {
    if (!videoId || !title) return;
    const clean = title.trim();
    if (!clean || clean.toLowerCase() === 'flix' || clean.toLowerCase() === 'netflix' || clean.startsWith('Netflix Video')) return;
    const data = await this.get('video_titles');
    const videoTitles = data.video_titles || {};
    videoTitles[String(videoId)] = clean;
    await this.set({ video_titles: videoTitles });
  }

  static async getCachedTitle(videoId) {
    if (!videoId) return null;
    const data = await this.get('video_titles');
    const videoTitles = data.video_titles || {};
    const title = videoTitles[String(videoId)] || null;
    if (title && (title.toLowerCase() === 'flix' || title.toLowerCase() === 'netflix' || title.startsWith('Netflix Video') || !title.trim())) {
      delete videoTitles[String(videoId)];
      try { await this.set({ video_titles: videoTitles }); } catch (e) {}
      return null;
    }
    return title;
  }

  static async saveEpisodeSubtitles(mediaKey, subtitleData) {
    if (!subtitleData || !subtitleData.cues) return;
    const data = await this.get('cached_subtitles');
    const cache = data.cached_subtitles || {};

    const keys = Object.keys(cache);
    if (keys.length > 30) {
      keys.sort((a, b) => (cache[a].timestamp || 0) - (cache[b].timestamp || 0));
      for (let i = 0; i < keys.length - 20; i++) {
        delete cache[keys[i]];
      }
    }

    const cleanVid = subtitleData.videoId ? String(subtitleData.videoId) : null;
    const entry = {
      cues: subtitleData.cues,
      filename: subtitleData.filename || 'subtitle.srt',
      offset: subtitleData.offset || 0,
      isTranslated: !!subtitleData.isTranslated,
      title: subtitleData.title || '',
      videoId: cleanVid,
      timestamp: Date.now()
    };

    const isPlaceholderKey = !mediaKey ||
      mediaKey.toLowerCase() === 'flix' ||
      mediaKey.toLowerCase() === 'netflix' ||
      mediaKey.startsWith('Netflix Video');

    if (mediaKey && !isPlaceholderKey) {
      cache[mediaKey] = entry;
    }
    if (cleanVid) {
      cache[`vid_${cleanVid}`] = entry;
    }
    await this.set({ cached_subtitles: cache });
  }

  static async getEpisodeSubtitles(mediaKey, videoId = null) {
    try {
      const data = await this.get('cached_subtitles');
      const cache = data.cached_subtitles || {};
      const cleanVid = videoId ? String(videoId) : null;

      // 1. Highest priority: exact videoId match!
      if (cleanVid && cache[`vid_${cleanVid}`]) {
        const vidEntry = cache[`vid_${cleanVid}`];
        if (vidEntry && vidEntry.cues && vidEntry.cues.length > 0) {
          return vidEntry;
        }
      }

      // 2. Match by mediaKey ONLY if it does not conflict with a different videoId
      if (mediaKey && cache[mediaKey]) {
        const lowerKey = mediaKey.trim().toLowerCase();
        if (lowerKey === 'flix' || lowerKey === 'netflix' || lowerKey.startsWith('netflix video')) {
          return null; // Reject placeholder mediaKey
        }
        const entry = cache[mediaKey];
        if (cleanVid && entry.videoId && String(entry.videoId) !== cleanVid) {
          // Belongs to a different video, reject to prevent cross-video pollution
          return null;
        }
        return entry;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StorageAdapter };
}
if (typeof globalThis !== 'undefined') {
  globalThis.StorageAdapter = StorageAdapter;
}
