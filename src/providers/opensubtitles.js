/**
 * OpenSubtitlesAdapter - OpenSubtitles Provider Implementation
 * 
 * Supports querying OpenSubtitles REST API
 */

class OpenSubtitlesAdapter extends (typeof SubtitleProvider !== 'undefined' ? SubtitleProvider : ((typeof require !== 'undefined') ? require('./provider.js').SubtitleProvider : class {})) {
  constructor(apiKey = '') {
    super('OpenSubtitles');
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.opensubtitles.com/api/v1/subtitles';
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  async search(mediaIdentity, language = 'zh-CN') {
    if (!mediaIdentity || !mediaIdentity.title) return [];

    let langCode = 'zh-CN';
    if (language.startsWith('zh')) langCode = 'zh-CN,zh-TW';
    else if (language.startsWith('en')) langCode = 'en';

    const params = new URLSearchParams({
      query: mediaIdentity.title,
      languages: langCode
    });

    if (mediaIdentity.season !== undefined) params.append('season_number', String(mediaIdentity.season));
    if (mediaIdentity.episode !== undefined) params.append('episode_number', String(mediaIdentity.episode));
    if (mediaIdentity.year) params.append('year', String(mediaIdentity.year));

    try {
      const headers = {
        'User-Agent': 'NetflixSubtitleOverlay v0.1.0'
      };
      if (this.apiKey) {
        headers['Api-Key'] = this.apiKey;
      }

      const res = await fetch(`${this.baseUrl}?${params.toString()}`, { headers });
      if (!res.ok) return [];

      const data = await res.json();
      const items = data.data || [];

      return items.map(item => {
        const attr = item.attributes || {};
        const files = attr.files || [];
        const fileId = files[0] ? files[0].file_id : null;
        return {
          id: fileId || item.id,
          provider: 'OpenSubtitles',
          title: mediaIdentity.title,
          release_name: attr.release || attr.feature_details?.title || mediaIdentity.title,
          language: attr.language || language,
          season: attr.feature_details?.season_number,
          episode: attr.feature_details?.episode_number,
          year: attr.feature_details?.year,
          fileId: fileId,
          downloadUrl: files[0] ? files[0].file_name : null,
          source: 'OpenSubtitles'
        };
      });
    } catch (e) {
      console.warn('[OpenSubtitles] Search error:', e);
      return [];
    }
  }

  async download(result) {
    if (!result || !result.fileId) {
      throw new Error('[OpenSubtitles] Missing file ID for download');
    }

    const res = await fetch('https://api.opensubtitles.com/api/v1/download', {
      method: 'POST',
      headers: {
        'User-Agent': 'NetflixSubtitleOverlay v0.1.0',
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Api-Key': this.apiKey } : {})
      },
      body: JSON.stringify({ file_id: result.fileId })
    });

    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    const data = await res.json();
    if (!data.link) throw new Error('No download link provided by OpenSubtitles');

    const subRes = await fetch(data.link);
    return await subRes.text();
  }

  /**
   * Test OpenSubtitles API Key connectivity
   */
  static async testConnection(apiKey) {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'API Key 为空' };
    }
    const cleanKey = apiKey.trim();
    try {
      const url = `https://api.opensubtitles.com/api/v1/subtitles?query=Inception`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'NetflixSubtitleOverlay v0.1.0',
          'Api-Key': cleanKey
        }
      });
      if (res.status === 403 || res.status === 401) {
        return { success: false, error: `认证失败 (HTTP ${res.status}): OpenSubtitles Key 无效` };
      }
      if (res.ok) {
        return { success: true, message: 'OpenSubtitles API Key 验证通过！' };
      }
      return { success: false, error: `服务响应异常: HTTP ${res.status}` };
    } catch (e) {
      return { success: false, error: `网络请求失败: ${e.message}` };
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OpenSubtitlesAdapter };
}
if (typeof globalThis !== 'undefined') {
  globalThis.OpenSubtitlesAdapter = OpenSubtitlesAdapter;
}
