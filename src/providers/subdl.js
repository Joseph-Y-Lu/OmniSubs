/**
 * SubdlAdapter - SubDL Subtitle Provider Implementation
 * 
 * Interacts with SubDL REST API (https://subdl.com/api-doc):
 * - Searches for subtitle releases by title, season, episode, and language
 * - Downloads and extracts subtitle files
 */

class SubdlAdapter extends (typeof SubtitleProvider !== 'undefined' ? SubtitleProvider : ((typeof require !== 'undefined') ? require('./provider.js').SubtitleProvider : class {})) {
  constructor(apiKey = '') {
    super('SubDL');
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.subdl.com/api/v1/subtitles';
    this.downloadBaseUrl = 'https://dl.subdl.com';
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  /**
   * Search subtitles matching media identity
   * @param {Object} mediaIdentity { title, year, type, season, episode }
   * @param {string} language e.g. "zh-CN", "en"
   * @returns {Promise<Array<Object>>}
   */
  async search(mediaIdentity, language = 'zh-CN') {
    if (!mediaIdentity || !mediaIdentity.title) {
      return [];
    }

    const cleanTitle = (mediaIdentity.title || '')
      .replace(/^Netflix Video.*$/i, '')
      .trim();

    if (!cleanTitle) {
      return [];
    }

    if (!this.apiKey) {
      console.warn('[SubDL] API key not configured.');
      return [];
    }

    const params = new URLSearchParams({
      api_key: this.apiKey.trim(),
      film_name: cleanTitle
    });

    if (mediaIdentity.type === 'tv' || mediaIdentity.season !== undefined) {
      params.append('type', 'tv');
      if (mediaIdentity.season !== undefined) params.append('season_number', String(mediaIdentity.season));
      if (mediaIdentity.episode !== undefined) params.append('episode_number', String(mediaIdentity.episode));
    } else if (mediaIdentity.type === 'movie') {
      params.append('type', 'movie');
      if (mediaIdentity.year) params.append('year', String(mediaIdentity.year));
    }

    // SubDL accepts 2-letter ISO codes (en, zh)
    let langParam = 'en,zh';
    if (language.startsWith('zh')) {
      langParam = 'zh,en';
    } else if (language.startsWith('en')) {
      langParam = 'en';
    }
    params.append('languages', langParam);

    const url = `${this.baseUrl}?${params.toString()}`;

    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`SubDL API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data || !data.status) {
        if (data && data.error) {
          console.warn(`[SubDL] API status false: ${data.error}`);
        }
        // Fallback: If searched as movie and failed, retry as TV show
        if (mediaIdentity.type === 'movie' && !mediaIdentity._retriedTv) {
          return await this.search({ ...mediaIdentity, type: 'tv', _retriedTv: true }, language);
        }
        return [];
      }

      // Handle both root subtitles array and nested results[].subtitles
      let items = [];
      if (Array.isArray(data.subtitles)) {
        items = data.subtitles;
      } else if (Array.isArray(data.results)) {
        for (const res of data.results) {
          if (Array.isArray(res.subtitles)) {
            items.push(...res.subtitles);
          }
        }
        if (items.length === 0 && data.results.length > 0 && data.results[0].url) {
          items = data.results;
        }
      }

      return items.map((item, idx) => {
        let downloadUrl = null;
        if (item.url) {
          if (item.url.startsWith('http')) {
            downloadUrl = item.url;
          } else {
            const path = item.url.startsWith('/') ? item.url : `/${item.url}`;
            downloadUrl = `${this.downloadBaseUrl}${path}`;
          }
        }

        return {
          id: item.url || `subdl_${idx}`,
          provider: 'SubDL',
          title: cleanTitle,
          release_name: item.release_name || item.name || cleanTitle,
          language: item.lang || item.language || language,
          season: item.season !== undefined ? item.season : mediaIdentity.season,
          episode: item.episode !== undefined ? item.episode : mediaIdentity.episode,
          year: item.year || mediaIdentity.year,
          downloadUrl,
          author: item.author || 'SubDL',
          source: 'SubDL'
        };
      });
    } catch (err) {
      console.error('[SubDL] Search failed:', err);
      throw err;
    }
  }

  /**
   * Test API Key connectivity
   */
  static async testConnection(apiKey) {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'API Key 为空' };
    }
    const cleanKey = apiKey.trim();
    try {
      const url = `https://api.subdl.com/api/v1/subtitles?api_key=${encodeURIComponent(cleanKey)}&film_name=Inception`;
      const res = await fetch(url);
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch (e) {}

      if (res.status === 403 || res.status === 401 || data.error === 'not_authorized') {
        return { success: false, error: `认证失败 (HTTP ${res.status}): 请检查 Key 是否复制完整或是否为正确的 API Token` };
      }
      if (!res.ok) {
        return { success: false, error: `服务响应异常: HTTP ${res.status}` };
      }
      if (data.status === true || Array.isArray(data.subtitles) || Array.isArray(data.results)) {
        return { success: true, message: 'SubDL API Key 验证通过！连接成功' };
      }
      return { success: false, error: data.error || data.message || '未知响应状态' };
    } catch (e) {
      return { success: false, error: `网络请求失败: ${e.message}` };
    }
  }

  /**
   * Download subtitle text
   * @param {Object} result Subtitle result item
   * @returns {Promise<string>} raw subtitle text
   */
  async download(result) {
    if (!result || !result.downloadUrl) {
      throw new Error('[SubDL] Download URL is missing');
    }

    try {
      const response = await fetch(result.downloadUrl);
      if (!response.ok) {
        throw new Error(`Download failed with HTTP ${response.status}`);
      }

      // Check if it's a zip or plain text
      const contentType = response.headers.get('content-type') || '';
      const url = (result.downloadUrl || '').toLowerCase();
      if (contentType.includes('zip') || url.includes('.zip') || url.includes('subtitle/')) {
        // Zip archive handling
        const arrayBuffer = await response.arrayBuffer();
        const ep = result.episode !== undefined ? Number(result.episode) : null;
        const season = result.season !== undefined ? Number(result.season) : null;
        return await this.extractSrtFromZip(arrayBuffer, ep, season);
      }

      // Otherwise assume text file (.srt or .vtt)
      const text = await response.text();
      return text;
    } catch (err) {
      console.error('[SubDL] Download error:', err);
      throw err;
    }
  }

  /**
   * Lightweight in-memory extraction of .srt/.vtt from uncompressed or deflate zip
   * Standard PKZip format parser without external libraries
   * Accurately targets specific episode in season packs!
   */
  async extractSrtFromZip(arrayBuffer, targetEpisode = null, targetSeason = null) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const entries = [];

    // Look for Local File Header signature: 0x04034b50
    let offset = 0;
    while (offset < bytes.length - 30) {
      if (view.getUint32(offset, true) === 0x04034b50) {
        const compressionMethod = view.getUint16(offset + 8, true);
        const compressedSize = view.getUint32(offset + 18, true);
        const uncompressedSize = view.getUint32(offset + 22, true);
        const filenameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);

        const filenameBytes = bytes.slice(offset + 30, offset + 30 + filenameLen);
        const filename = new TextDecoder('utf-8').decode(filenameBytes);

        const dataOffset = offset + 30 + filenameLen + extraLen;
        const fileData = bytes.slice(dataOffset, dataOffset + compressedSize);

        if (filename.toLowerCase().endsWith('.srt') || filename.toLowerCase().endsWith('.vtt')) {
          entries.push({ filename, compressionMethod, fileData });
        }
        offset = dataOffset + compressedSize;
      } else {
        offset++;
      }
    }

    if (entries.length === 0) {
      throw new Error('No .srt or .vtt subtitle found in ZIP archive.');
    }

    // If an episode target is specified, look for matching entry
    let selectedEntry = entries[0];
    if (targetEpisode !== null && entries.length > 1) {
      const epNum = Number(targetEpisode);
      const epStr = String(epNum).padStart(2, '0');
      // Match patterns like "s01e01", "e01", "ep01", "01 The Hedge Knight", "episode 1"
      const epRegex = new RegExp(`(?:e|ep|episode[._\\s-]*|s\\d+e|^|[^\\d])${epStr}(?:[^\\d]|$)`, 'i');
      const match = entries.find(e => epRegex.test(e.filename));
      if (match) {
        selectedEntry = match;
      }
    }

    if (selectedEntry.compressionMethod === 0) {
      return new TextDecoder('utf-8').decode(selectedEntry.fileData);
    } else if (selectedEntry.compressionMethod === 8) {
      if (typeof DecompressionStream !== 'undefined') {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(selectedEntry.fileData);
            controller.close();
          }
        }).pipeThrough(new DecompressionStream('deflate-raw'));

        const response = new Response(stream);
        return await response.text();
      }
    }

    throw new Error('No compatible .srt or .vtt subtitle extracted from ZIP archive.');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SubdlAdapter };
}
if (typeof globalThis !== 'undefined') {
  globalThis.SubdlAdapter = SubdlAdapter;
}
