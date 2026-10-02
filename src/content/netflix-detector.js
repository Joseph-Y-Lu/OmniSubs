/**
 * NetflixMetadataAdapter - Decoupled metadata extraction for Netflix
 * 
 * Safely extracts media identification information from Netflix player DOM, URL,
 * meta tags, and user overrides.
 * 
 * Output:
 * interface MediaIdentity {
 *   title: string;
 *   year?: number;
 *   type: "movie" | "tv";
 *   season?: number;
 *   episode?: number;
 *   episodeTitle?: string;
 *   videoId?: string;
 * }
 */

class NetflixMetadataAdapter {
  static videoTitleCache = new Map();
  static pendingCallbacks = new Map();

  static injectBridge() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('netflix-sub-page-bridge')) return;
    try {
      const s = document.createElement('script');
      s.id = 'netflix-sub-page-bridge';
      s.src = chrome.runtime.getURL('src/content/page-bridge.js');
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  }

  static async preloadCache() {
    if (typeof StorageAdapter !== 'undefined' && StorageAdapter.get) {
      try {
        const data = await StorageAdapter.get('video_titles');
        if (data && data.video_titles) {
          for (const [id, title] of Object.entries(data.video_titles)) {
            if (title && NetflixMetadataAdapter.isValidTitle(title)) {
              NetflixMetadataAdapter.videoTitleCache.set(String(id), title);
            }
          }
        }
      } catch (e) {}
    }
  }

  constructor() {
    this.currentIdentity = null;
    this.listeners = [];
    this.checkInterval = null;
    this.manualOverrideTitle = null;

    if (typeof window !== 'undefined') {
      NetflixMetadataAdapter.preloadCache().then(() => {
        this.check();
      });

      window.addEventListener('NETFLIX_METADATA_DISCOVERED', (e) => {
        if (e.detail && e.detail.title && !e.detail.title.startsWith('Netflix Video')) {
          if (e.detail.videoId) {
            NetflixMetadataAdapter.videoTitleCache.set(e.detail.videoId, e.detail.title);
          }
          this.check();
        }
      });
      NetflixMetadataAdapter.injectBridge();
    }
  }

  static getPlatform() {
    if (typeof window === 'undefined' || !window.location || !window.location.hostname) {
      return 'universal';
    }
    const host = window.location.hostname.toLowerCase();
    if (host.includes('netflix.com')) return 'netflix';
    if (host.includes('primevideo.com') || host.includes('amazon.')) return 'prime';
    if (host.includes('crave.ca')) return 'crave';
    if (host.includes('disneyplus.com')) return 'disney';
    if (host.includes('max.com') || host.includes('hbomax.com')) return 'max';
    if (host.includes('apple.com')) return 'appletv';
    if (host.includes('hulu.com')) return 'hulu';
    if (host.includes('youtube.com')) return 'youtube';
    if (host.includes('paramountplus.com')) return 'paramount';
    if (host.includes('peacocktv.com')) return 'peacock';
    if (host.includes('crunchyroll.com')) return 'crunchyroll';
    if (host.includes('bilibili.com')) return 'bilibili';
    return 'universal';
  }

  /**
   * Clean page titles across Netflix, Prime Video, Crave, Disney+, Max, YouTube and all locales
   * e.g. "Watch The Thicket | Netflix" -> "The Thicket"
   * e.g. "The Lord of the Rings: The Rings of Power - Season 2 | Prime Video" -> "The Lord of the Rings: The Rings of Power"
   * e.g. "House of the Dragon | Crave" -> "House of the Dragon"
   * e.g. "Loki | Disney+" -> "Loki"
   */
  static cleanTitle(raw) {
    if (!raw) return '';
    let str = raw.trim();
    if (/^(?:netflix|flix|net\s*flix|prime\s*video|crave|disney\+?|hbo\s*max|max|hulu|youtube)$/i.test(str)) return '';

    // Strip quality tags, resolution markers, and streaming service tags
    str = str
      .replace(/\[\s*(?:4k\s*uhd|ultra\s*hd|4k|uhd|hd|hdr|1080p|720p|x-ray|cc)\s*\]/gi, '')
      .replace(/\(\s*(?:4k\s*uhd|ultra\s*hd|4k|uhd|hd|hdr|1080p|720p|x-ray|cc)\s*\)/gi, '');

    for (let i = 0; i < 3; i++) {
      str = str
        // Netflix prefix/suffix
        .replace(/^netflix\s*[-–—|:]\s*/i, '')
        .replace(/\s*[-–—|:]\s*netflix.*$/i, '')
        .replace(/\s*\|\s*netflix.*$/i, '')
        .replace(/\s*\|\s*watch on netflix.*$/i, '')
        // Prime Video prefix/suffix
        .replace(/^prime\s*video\s*[-–—|:]\s*/i, '')
        .replace(/\s*[-–—|:]\s*(?:prime\s*video|amazon\s*prime).*$/i, '')
        .replace(/\s*\|\s*(?:prime\s*video|amazon\s*video|amazon).*$/i, '')
        // Crave prefix/suffix
        .replace(/^crave\s*[-–—|:]\s*/i, '')
        .replace(/\s*[-–—|:]\s*crave.*$/i, '')
        .replace(/\s*\|\s*crave.*$/i, '')
        .replace(/\s*\|\s*watch\s+(?:movies\s+and\s+shows\s+)?on\s+crave.*$/i, '')
        .replace(/\s+(?:on|at)\s+(?:crave|prime\s*video|netflix|disney\+?|hbo\s*max|max|apple\s*tv\+?).*$/i, '')
        // Disney+ prefix/suffix
        .replace(/^disney\+?\s*[-–—|:]\s*/i, '')
        .replace(/\s*[-–—|:]\s*disney\+?.*$/i, '')
        .replace(/\s*\|\s*disney\+?.*$/i, '')
        // Max / HBO Max
        .replace(/^(?:max|hbo\s*max)\s*[-–—|:]\s*/i, '')
        .replace(/\s*[-–—|:]\s*(?:max|hbo\s*max).*$/i, '')
        .replace(/\s*\|\s*(?:max|hbo\s*max).*$/i, '')
        // Apple TV+
        .replace(/^apple\s*tv\+?\s*[-–—|:]\s*/i, '')
        .replace(/\s*[-–—|:]\s*apple\s*tv\+?.*$/i, '')
        .replace(/\s*\|\s*apple\s*tv\+?.*$/i, '')
        // Hulu & YouTube & others
        .replace(/\s*[-–—|:]\s*hulu.*$/i, '')
        .replace(/\s*[-–—|:]\s*youtube.*$/i, '')
        .replace(/\s*[-–—|:]\s*paramount\+?.*$/i, '')
        .replace(/\s*[-–—|:]\s*peacock.*$/i, '')
        .replace(/\s*[-–—|:]\s*crunchyroll.*$/i, '')
        .replace(/_哔哩哔哩_bilibili.*$/i, '')
        // Common action phrases
        .replace(/^(?:[看觀观看]|watch\s+online|watch|online)\s*[：:\s《<“"']*/i, '')
        .replace(/[》>”"']+$/g, '')
        .trim();
    }
    const finalClean = str.replace(/["']/g, '').trim();
    if (/^(?:netflix|flix|net\s*flix|prime\s*video|crave|disney\+?|max|hbo\s*max|apple\s*tv|hulu|youtube)$/i.test(finalClean)) return '';
    return finalClean;
  }

  /**
   * Parse season and episode strings across platforms
   * Examples: "S2:E4", "Season 2 Episode 4", "Season 2, Ep. 4", "第2季 第4集", "S02E04"
   * @param {string} text
   * @returns {{season?: number, episode?: number}|null}
   */
  static parseSeasonEpisode(text) {
    if (!text) return null;
    const clean = text.trim();

    // Pattern 1: S2:E4 or S02E04 or S2 E4 or S2, Ep. 4
    const sRegex = /S(\d+)[:\s,]*E(?:p\.?)?(\d+)/i.exec(clean);
    if (sRegex) {
      return { season: parseInt(sRegex[1], 10), episode: parseInt(sRegex[2], 10) };
    }

    // Pattern 2: Season 2 Episode 4 / Season 2, Ep. 4 / Season 2 Ep. 4
    const sWordRegex = /Season\s*(\d+)[^0-9]*(?:Episode|Ep\.?)\s*(\d+)/i.exec(clean);
    if (sWordRegex) {
      return { season: parseInt(sWordRegex[1], 10), episode: parseInt(sWordRegex[2], 10) };
    }

    // Pattern 3: Chinese/Japanese/Korean 第X季 第Y集
    const cjkRegex = /第\s*(\d+)\s*季\s*第\s*(\d+)\s*集/.exec(clean);
    if (cjkRegex) {
      return { season: parseInt(cjkRegex[1], 10), episode: parseInt(cjkRegex[2], 10) };
    }

    // Pattern 4: Just episode: "Episode 4" or "Ep. 4" or "第 4 集"
    const epOnlyRegex = /(?:Episode|Ep\.?|第)\s*(\d+)(?:\s*集)?/i.exec(clean);
    if (epOnlyRegex) {
      return { season: 1, episode: parseInt(epOnlyRegex[1], 10) };
    }

    return null;
  }

  /**
   * Extract Video ID across streaming platforms
   * e.g. Netflix: "/watch/80057281" -> "80057281"
   * e.g. Prime Video: "/detail/B0DFV2X5Z6" -> "B0DFV2X5Z6" or asin param
   * e.g. Crave: "/watch/the-wire" -> "the-wire"
   * e.g. Disney+: "/play/c9f9... -> "c9f9..."
   * e.g. YouTube: "v=dQw4w9WgXcQ" -> "dQw4w9WgXcQ"
   */
  static extractVideoId() {
    if (typeof window === 'undefined' || !window.location) return null;
    const pathname = window.location.pathname || '';
    const search = window.location.search || '';
    const platform = NetflixMetadataAdapter.getPlatform();

    if (platform === 'netflix') {
      const match = /\/watch\/(\d+)/.exec(pathname);
      return match ? match[1] : null;
    }

    if (platform === 'prime') {
      // 1. Check asin query param
      const urlParams = new URLSearchParams(search);
      const asin = urlParams.get('asin') || urlParams.get('gti');
      if (asin) return asin;

      // 2. Check path patterns
      const pathMatch = /\/(?:detail|gp\/video\/detail|watch)\/([a-zA-Z0-9_-]+)/.exec(pathname);
      if (pathMatch) return pathMatch[1];
    }

    if (platform === 'crave') {
      const match = /\/(?:watch|series|movies|play)\/([a-zA-Z0-9_-]+)(?:\/([a-zA-Z0-9_-]+))?/.exec(pathname);
      if (match) return match[2] || match[1];
    }

    if (platform === 'disney') {
      const match = /\/play\/([a-zA-Z0-9-]+)/.exec(pathname);
      if (match) return match[1];
    }

    if (platform === 'max') {
      const match = /\/(?:video\/watch|player)\/([a-zA-Z0-9-]+)/.exec(pathname);
      if (match) return match[1];
    }

    if (platform === 'appletv') {
      const match = /\/(?:episode|movie|show)\/([a-zA-Z0-9._-]+)/.exec(pathname);
      if (match) return match[1];
    }

    if (platform === 'hulu') {
      const match = /\/watch\/([a-zA-Z0-9-]+)/.exec(pathname);
      if (match) return match[1];
    }

    if (platform === 'youtube') {
      const urlParams = new URLSearchParams(search);
      const v = urlParams.get('v');
      if (v) return v;
      const embedMatch = /\/embed\/([a-zA-Z0-9_-]{11})/.exec(pathname);
      if (embedMatch) return embedMatch[1];
    }

    if (platform === 'bilibili') {
      const bvMatch = /\/(BV[a-zA-Z0-9]+)/.exec(pathname);
      if (bvMatch) return bvMatch[1];
      const epMatch = /\/play\/(ep\d+|ss\d+)/.exec(pathname);
      if (epMatch) return epMatch[1];
    }

    // Generic fallback for any video streaming site
    if (pathname && pathname !== '/' && pathname.length > 2) {
      const segments = pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        return segments[segments.length - 1].replace(/\.[a-zA-Z0-9]+$/, '');
      }
    }

    return null;
  }

  /**
   * Validates whether an extracted string is a real media title and not a streaming platform slogan or navigation item
   * @param {string} title
   * @returns {boolean}
   */
  static isValidTitle(title) {
    if (!title || typeof title !== 'string') return false;
    const t = title.trim();
    if (t.length < 2 || t.length > 100) return false;
    if (/^(?:netflix(?:\s*video)?(?:\s*\d+)?|flix|net\s*flix|prime\s*video|crave|disney\+?|max|hbo\s*max|apple\s*tv|hulu|youtube)$/i.test(t)) return false;
    const lower = t.toLowerCase();
    if (lower === 'flix' || lower === 'netflix') return false;
    const invalidPhrases = [
      'watch tv shows',
      'watch movies',
      'tv shows online',
      'movies online',
      '在线观看',
      '線上看',
      'unlimited movies',
      'watch on netflix',
      'see what is next',
      'see whats next',
      'welcome to netflix',
      'netflix home',
      'watch on prime',
      'prime video',
      'amazon prime',
      'crave home',
      'welcome to crave',
      'disney plus',
      'disney+',
      'hbo max',
      'apple tv',
      'browse',
      'player view',
      'undefined',
      'null',
      'unknown title'
    ];
    for (const p of invalidPhrases) {
      if (lower.includes(p)) return false;
    }
    return true;
  }

  /**
   * Set manual title override and persist across page refreshes
   */
  async setManualTitle(title, targetVideoId = null) {
    const videoId = targetVideoId || NetflixMetadataAdapter.extractVideoId();
    this.manualOverrideTitle = title;
    this.manualOverrideVideoId = videoId;
    if (videoId && title) {
      NetflixMetadataAdapter.videoTitleCache.set(videoId, title);
      if (typeof StorageAdapter !== 'undefined' && StorageAdapter.saveCachedTitle) {
        await StorageAdapter.saveCachedTitle(videoId, title);
      }
    }
    this.check();
  }

  /**
   * Fetch Netflix title page in the background to accurately resolve official media title
   * Validates strictly to avoid landing page slogan pollution
   */
  static async fetchTitleByVideoId(videoId, callback) {
    if (!videoId) return;

    if (this.videoTitleCache.has(videoId)) {
      if (typeof callback === 'function') callback(this.videoTitleCache.get(videoId));
      return;
    }

    // Check persistent storage first!
    if (typeof StorageAdapter !== 'undefined' && StorageAdapter.getCachedTitle) {
      const persisted = await StorageAdapter.getCachedTitle(videoId);
      if (persisted && NetflixMetadataAdapter.isValidTitle(persisted)) {
        this.videoTitleCache.set(videoId, persisted);
        if (typeof callback === 'function') callback(persisted);
        return;
      }
    }

    if (this.pendingCallbacks.has(videoId)) {
      if (typeof callback === 'function') {
        this.pendingCallbacks.get(videoId).push(callback);
      }
      return;
    }

    const cbs = [];
    if (typeof callback === 'function') cbs.push(callback);
    this.pendingCallbacks.set(videoId, cbs);

    try {
      const res = await fetch(`/title/${videoId}`);
      if (res.ok) {
        const html = await res.text();
        let title = '';
        const ogMatch = /<meta[^>]+property=["\x27]og:title["\x27][^>]+content=["\x27]([^"\x27]+)["\x27]/i.exec(html) ||
                        /<meta[^>]+content=["\x27]([^"\x27]+)["\x27][^>]+property=["\x27]og:title["\x27]/i.exec(html);

        if (ogMatch && ogMatch[1]) {
          const c = NetflixMetadataAdapter.cleanTitle(ogMatch[1]);
          if (c && NetflixMetadataAdapter.isValidTitle(c)) title = c;
        }

        // Fallback 1: JSON-LD structured data
        if (!title) {
          const ldMatches = html.match(/<script[^>]+type=["\x27]application\/ld\+json["\x27][^>]*>([\s\S]*?)<\/script>/gi);
          if (ldMatches) {
            for (const scriptTag of ldMatches) {
              try {
                const jsonText = scriptTag.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
                const data = JSON.parse(jsonText);
                const rawName = data.name || data.headline;
                if (rawName && typeof rawName === 'string') {
                  const cleaned = NetflixMetadataAdapter.cleanTitle(rawName);
                  if (cleaned && NetflixMetadataAdapter.isValidTitle(cleaned)) {
                    title = cleaned;
                    break;
                  }
                }
              } catch (e) {}
            }
          }
        }

        // Fallback 2: Twitter title meta
        if (!title) {
          const twMatch = /<meta[^>]+name=["\x27]twitter:title["\x27][^>]+content=["\x27]([^"\x27]+)["\x27]/i.exec(html) ||
                          /<meta[^>]+content=["\x27]([^"\x27]+)["\x27][^>]+name=["\x27]twitter:title["\x27]/i.exec(html);
          if (twMatch && twMatch[1]) {
            const cleaned = NetflixMetadataAdapter.cleanTitle(twMatch[1]);
            if (cleaned && NetflixMetadataAdapter.isValidTitle(cleaned)) title = cleaned;
          }
        }

        // Fallback 3: Title tag
        if (!title) {
          const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
          if (titleMatch && titleMatch[1]) {
            const cleaned = NetflixMetadataAdapter.cleanTitle(titleMatch[1]);
            if (cleaned && NetflixMetadataAdapter.isValidTitle(cleaned)) title = cleaned;
          }
        }

        // Fallback 4: Heading tag
        if (!title) {
          const h1Match = /<h1[^>]*class=["\x27][^"\x27]*title[^"\x27]*["\x27][^>]*>([^<]+)<\/h1>/i.exec(html) ||
                          /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
          if (h1Match && h1Match[1]) {
            const cleaned = NetflixMetadataAdapter.cleanTitle(h1Match[1]);
            if (cleaned && NetflixMetadataAdapter.isValidTitle(cleaned)) title = cleaned;
          }
        }

        if (title && NetflixMetadataAdapter.isValidTitle(title)) {
          NetflixMetadataAdapter.videoTitleCache.set(videoId, title);
          if (typeof StorageAdapter !== 'undefined' && StorageAdapter.saveCachedTitle) {
            StorageAdapter.saveCachedTitle(videoId, title);
          }
        }
      }
    } catch (err) {
      console.warn('[NetflixMetadataAdapter] fetchTitleByVideoId error:', err);
    } finally {
      const waiting = this.pendingCallbacks.get(videoId) || [];
      this.pendingCallbacks.delete(videoId);
      const resolved = this.videoTitleCache.get(videoId) || null;
      waiting.forEach(cb => {
        try { cb(resolved); } catch (e) {}
      });
    }
  }

  detect() {
    const platform = NetflixMetadataAdapter.getPlatform();
    const videoId = NetflixMetadataAdapter.extractVideoId();

    if (!videoId && (typeof window === 'undefined' || !window.location)) {
      if (!this.manualOverrideTitle) return null;
    }
    // If not netflix, allow video tag presence to trigger detection
    if (!videoId && typeof document !== 'undefined') {
      const hasVideo = !!document.querySelector('video');
      if (!hasVideo && !this.manualOverrideTitle) return null;
    }

    let title = '';
    let season = undefined;
    let episode = undefined;
    let episodeTitle = undefined;
    let type = 'movie';

    // Layer -1: Check data-netflix-title written by page-bridge from window.netflix (Netflix only)
    if (platform === 'netflix' && typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset) {
      const bridgeVideoId = document.documentElement.dataset.netflixVideoid;
      // CRITICAL: Only trust bridge dataset if it explicitly matches the currently active videoId!
      if (!bridgeVideoId || bridgeVideoId === videoId) {
        const bridgeTitle = document.documentElement.dataset.netflixTitle;
        if (bridgeTitle && !bridgeTitle.startsWith('Netflix Video') && NetflixMetadataAdapter.isValidTitle(bridgeTitle)) {
          title = bridgeTitle.trim();
          if (document.documentElement.dataset.netflixSeason) {
            season = parseInt(document.documentElement.dataset.netflixSeason, 10);
          }
          if (document.documentElement.dataset.netflixEpisode) {
            episode = parseInt(document.documentElement.dataset.netflixEpisode, 10);
          }
          if (document.documentElement.dataset.netflixType) {
            type = document.documentElement.dataset.netflixType;
          }
          if (videoId && !NetflixMetadataAdapter.videoTitleCache.has(videoId)) {
            NetflixMetadataAdapter.videoTitleCache.set(videoId, title);
          }
        }
      }
    }

    // Layer 0: Check manual override or memory cache
    if (!title) {
      if (this.manualOverrideTitle) {
        if (videoId && this.manualOverrideVideoId && this.manualOverrideVideoId !== videoId) {
          // Movie changed: automatically clear stale manual override!
          this.manualOverrideTitle = null;
          this.manualOverrideVideoId = null;
        } else {
          title = this.manualOverrideTitle;
        }
      }
      if (!title && videoId && NetflixMetadataAdapter.videoTitleCache.has(videoId)) {
        title = NetflixMetadataAdapter.videoTitleCache.get(videoId);
      }
    }

    // Layer 0.5: Wake up controls DOM with synthetic event if needed
    if (!title && typeof document !== 'undefined') {
      try {
        const playerView = document.querySelector('.watch-video--player-view') ||
                           document.querySelector('.webPlayerContainer') ||
                           document.querySelector('.btm-media-player') ||
                           document.body;
        playerView.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 200, clientY: 200 }));
      } catch (e) {}
    }

    // Layer 1: Query DOM elements across streaming platforms
    if (!title && typeof document !== 'undefined') {
      const platformContainers = [];

      if (platform === 'netflix') {
        platformContainers.push(
          '[data-uia="video-title"]',
          '.watch-video--headline',
          '[data-uia="control-header"]',
          '.video-title'
        );
      } else if (platform === 'prime') {
        platformContainers.push(
          '[data-automation-id="title"]',
          '.atvwebplayersdk-title-text',
          '.dv-node-dp-title',
          '.DVWebNode-detail-atf-wrapper h1',
          '[data-testid="player-title"]',
          '.webPlayerContainer [class*="title"]',
          'h1.title'
        );
      } else if (platform === 'crave') {
        platformContainers.push(
          '.btm-media-player-title',
          '.crave-player-title',
          '.playback-title',
          'h1.brand-title',
          '[data-testid="video-title"]'
        );
      } else if (platform === 'disney') {
        platformContainers.push(
          '[data-testid="player-title"]',
          '.title-field',
          '.player-overlay h1',
          '[class*="video-title"]'
        );
      } else if (platform === 'max') {
        platformContainers.push(
          '[data-testid="player-title"]',
          '[data-testid="player_metadata_title"]',
          '.player-metadata-title'
        );
      } else if (platform === 'appletv') {
        platformContainers.push(
          '.playback-header__title',
          '.video-title'
        );
      } else if (platform === 'hulu') {
        platformContainers.push(
          '.player-metadata__title',
          '.headline',
          '[data-automationid="player-title"]'
        );
      } else if (platform === 'youtube') {
        platformContainers.push(
          'h1.ytd-watch-metadata yt-formatted-string',
          'h1.title yt-formatted-string',
          '.ytp-title-link'
        );
      } else if (platform === 'bilibili') {
        platformContainers.push(
          '.video-title',
          'h1.tit',
          '.media-title'
        );
      }

      // Universal fallbacks
      platformContainers.push(
        '[class*="player"] [class*="title"]',
        '[class*="video"] [class*="title"]',
        'h1'
      );

      for (const sel of platformContainers) {
        try {
          const container = document.querySelector(sel);
          if (container) {
            const h = container.querySelector('h1, h2, h3, h4, h5, .ellipsize-text, [class*="title"]') || container;
            const raw = (h.textContent || h.innerText || '').trim();
            if (raw.length > 0 && NetflixMetadataAdapter.isValidTitle(raw)) {
              const cleaned = NetflixMetadataAdapter.cleanTitle(raw);
              if (cleaned && NetflixMetadataAdapter.isValidTitle(cleaned)) {
                title = cleaned;
                break;
              }
            }
          }
        } catch (e) {}
      }

      // Check spans/subtitles for season/episode across platforms
      const subSelectors = [
        '[data-uia="video-title"] span',
        '.watch-video--headline span',
        '.atvwebplayersdk-subtitle-text',
        '[data-automation-id="subtitle"]',
        '.btm-media-player-subtitle',
        '.episode-tag',
        '[class*="season-episode"]',
        '[class*="subtitle-text"]'
      ];
      for (const subSel of subSelectors) {
        const spans = document.querySelectorAll(subSel);
        for (const span of spans) {
          const text = span ? (span.textContent || span.innerText || '').trim() : '';
          const seInfo = NetflixMetadataAdapter.parseSeasonEpisode(text);
          if (seInfo) {
            season = seInfo.season;
            episode = seInfo.episode;
            type = 'tv';
            break;
          } else if (text && text !== title && !episodeTitle && NetflixMetadataAdapter.isValidTitle(text)) {
            episodeTitle = text;
          }
        }
        if (season !== undefined) break;
      }
    }

    // Layer 1.5: Query JSON-LD structured metadata
    if (!title && typeof document !== 'undefined') {
      try {
        const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const s of ldScripts) {
          try {
            const data = JSON.parse(s.textContent);
            if (data && (data.name || data.headline)) {
              const ldTitle = NetflixMetadataAdapter.cleanTitle(data.name || data.headline);
              if (ldTitle && NetflixMetadataAdapter.isValidTitle(ldTitle)) {
                title = ldTitle;
                if (data['@type'] === 'TVSeries' || data['@type'] === 'TVEpisode') {
                  type = 'tv';
                }
                break;
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    // Layer 2: Query meta tags (ONLY if they belong to current video and not stale SPA head)
    if (!title && typeof document !== 'undefined') {
      const ogUrl = document.querySelector('meta[property="og:url"]')?.content || '';
      const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
      const combinedUrl = (ogUrl + ' ' + canonical);
      const urlVidMatch = combinedUrl.match(/\/(\d{6,})/);
      const isConflictingMeta = urlVidMatch && videoId && urlVidMatch[1] !== videoId;

      if (!isConflictingMeta) {
        const metaSelectors = [
          'meta[property="og:title"]',
          'meta[name="twitter:title"]',
          'meta[name="title"]'
        ];
        for (const sel of metaSelectors) {
          try {
            const meta = document.querySelector(sel);
            if (meta && meta.content) {
              const cleaned = NetflixMetadataAdapter.cleanTitle(meta.content);
              if (cleaned && NetflixMetadataAdapter.isValidTitle(cleaned)) {
                title = cleaned;
                break;
              }
            }
          } catch (e) {}
        }
      }
    }

    // Layer 3: Query document.title
    if (!title && typeof document !== 'undefined' && document.title) {
      const cleaned = NetflixMetadataAdapter.cleanTitle(document.title);
      if (cleaned && NetflixMetadataAdapter.isValidTitle(cleaned)) {
        const seInfo = NetflixMetadataAdapter.parseSeasonEpisode(cleaned);
        if (seInfo) {
          season = seInfo.season;
          episode = seInfo.episode;
          type = 'tv';
          // Extract base series title before season/episode markers
          const baseParts = cleaned.split(/(?::|\s*[-–—]\s*)\s*(?:Season\s*\d+|第\s*\d+\s*季|S\d+|Episode\s*\d+|第\s*\d+\s*集)/i);
          title = baseParts[0].trim();
        } else {
          const parts = cleaned.split(/\s*[-–—]\s*/);
          title = parts[0].trim();
          if (parts.length > 1 && !episodeTitle) {
            episodeTitle = parts[1].trim();
          }
        }
      }
    }

    // Layer 3.5: Parse Crave show title & season/episode directly from URL
    if (platform === 'crave' && typeof window !== 'undefined' && window.location) {
      const pathname = window.location.pathname || '';
      const craveMatch = /\/play\/([a-zA-Z0-9-]+)(?:\/([a-zA-Z0-9-]+))?/.exec(pathname);
      if (craveMatch && craveMatch[1]) {
        if (!title) {
          const seriesSlug = craveMatch[1];
          const formatted = seriesSlug
            .split('-')
            .map(w => {
              if (/^(?:of|the|and|in|on|at|to|a|an)$/i.test(w)) return w.toLowerCase();
              return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
            })
            .join(' ');
          title = formatted.charAt(0).toUpperCase() + formatted.slice(1);
          type = 'tv';
        }

        if (craveMatch[2]) {
          const epSlug = craveMatch[2];
          const se = NetflixMetadataAdapter.parseSeasonEpisode(epSlug);
          if (se) {
            season = se.season;
            episode = se.episode;
            type = 'tv';
          }
          const cleanEpTitle = epSlug
            .replace(/[-_]s\d+e\d+.*$/i, '')
            .replace(/[-_]\d+$/, '')
            .replace(/-/g, ' ');
          if (cleanEpTitle && cleanEpTitle !== craveMatch[1]) {
            episodeTitle = cleanEpTitle.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }
        }
      }
    }

    // Universal URL check for season & episode if still not found
    if (season === undefined && typeof window !== 'undefined' && window.location) {
      const fullUrl = (window.location.pathname || '') + ' ' + (window.location.search || '');
      const seFromUrl = NetflixMetadataAdapter.parseSeasonEpisode(fullUrl);
      if (seFromUrl) {
        season = seFromUrl.season;
        episode = seFromUrl.episode;
        type = 'tv';
      }
    }

    // Cache if found and valid (Never cache placeholder!)
    if (title && videoId && NetflixMetadataAdapter.isValidTitle(title) && !title.includes('Video ')) {
      NetflixMetadataAdapter.videoTitleCache.set(videoId, title);
      if (typeof StorageAdapter !== 'undefined' && StorageAdapter.saveCachedTitle) {
        StorageAdapter.saveCachedTitle(videoId, title);
      }
    }

    // Layer 4: Fallback placeholder & Asynchronous resolution
    if (!title && videoId) {
      if (typeof StorageAdapter !== 'undefined' && StorageAdapter.getCachedTitle) {
        StorageAdapter.getCachedTitle(videoId).then(persisted => {
          if (persisted && NetflixMetadataAdapter.isValidTitle(persisted)) {
            NetflixMetadataAdapter.videoTitleCache.set(videoId, persisted);
            this.check();
          }
        });
      }

      if (platform === 'netflix') {
        title = `Netflix Video ${videoId}`;
        NetflixMetadataAdapter.fetchTitleByVideoId(videoId, (resolvedTitle) => {
          if (resolvedTitle && NetflixMetadataAdapter.isValidTitle(resolvedTitle)) {
            this.check();
          }
        });
      } else {
        const platformLabel = platform === 'prime' ? 'Prime' :
                              platform === 'crave' ? 'Crave' :
                              platform === 'disney' ? 'Disney+' :
                              platform === 'max' ? 'Max' :
                              platform === 'youtube' ? 'YouTube' : 'Media';
        title = `${platformLabel} Video ${videoId}`;
      }
    }

    const identity = {
      title: title || 'Unknown Title',
      type: (season !== undefined || episode !== undefined) ? 'tv' : type,
      season,
      episode,
      episodeTitle,
      videoId,
      platform
    };

    return identity;
  }

  /**
   * Start continuous background detection to catch SPA transitions and episode changes
   * @param {number} intervalMs (default 1500ms)
   */
  startWatching(intervalMs = 1500) {
    this.stopWatching();
    this.check();

    this.checkInterval = setInterval(() => {
      this.check();
    }, intervalMs);
  }

  stopWatching() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  check() {
    if (typeof chrome !== 'undefined' && chrome.runtime && !chrome.runtime.id) {
      this.stopWatching();
      return;
    }
    const detected = this.detect();
    if (!detected) return;

    if (!this.currentIdentity ||
        this.currentIdentity.videoId !== detected.videoId ||
        this.currentIdentity.season !== detected.season ||
        this.currentIdentity.episode !== detected.episode ||
        this.currentIdentity.title !== detected.title) {
      
      const previous = this.currentIdentity;
      this.currentIdentity = detected;
      this.notify(detected, previous);
    }
  }

  onIdentityChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notify(current, previous) {
    for (const listener of this.listeners) {
      try {
        listener(current, previous);
      } catch (err) {
        console.error('[NetflixMetadataAdapter] Error notifying listener:', err);
      }
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NetflixMetadataAdapter, MediaDetector: NetflixMetadataAdapter };
}
if (typeof globalThis !== 'undefined') {
  globalThis.NetflixMetadataAdapter = NetflixMetadataAdapter;
  globalThis.MediaDetector = NetflixMetadataAdapter;
}
