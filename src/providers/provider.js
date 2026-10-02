/**
 * SubtitleProvider - Base interface for subtitle providers
 * 
 * Provides unified interface:
 * search(mediaIdentity, language): Promise<SubtitleResult[]>
 * download(result): Promise<string>
 */

class SubtitleProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Search for subtitles matching media identity
   * @param {Object} mediaIdentity { title, year, type, season, episode }
   * @param {string} language e.g. "zh-CN", "en"
   * @returns {Promise<Array<Object>>}
   */
  async search(mediaIdentity, language) {
    throw new Error(`search() not implemented in ${this.name}`);
  }

  /**
   * Download and return raw subtitle text (SRT or VTT)
   * @param {Object} result Subtitle result item
   * @returns {Promise<string>} raw subtitle content
   */
  async download(result) {
    throw new Error(`download() not implemented in ${this.name}`);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SubtitleProvider };
}
if (typeof globalThis !== 'undefined') {
  globalThis.SubtitleProvider = SubtitleProvider;
}
