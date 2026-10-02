/**
 * SubtitleTranslator - Full-file batch subtitle translator
 * 
 * Translates SubtitleCue[] from source language (e.g. English) into target language (e.g. Chinese Simplified)
 * while preserving 100% exact frame-accurate start/end timestamps.
 * 
 * Supports:
 * - 'target_only': Replace text with translation
 * - 'bilingual_zh_en': Chinese on line 1, English on line 2
 * - 'bilingual_en_zh': English on line 1, Chinese on line 2
 */

class SubtitleTranslator {
  static LANGUAGE_NAMES = {
    'zh-CN': '简体中文',
    'zh-TW': '繁体中文',
    'zh': '中文',
    'en': '英语',
    'ja': '日语',
    'ko': '韩语',
    'es': '西班牙语',
    'fr': '法语',
    'de': '德语',
    'ru': '俄语',
    'it': '意大利语',
    'pt': '葡萄牙语',
    'ar': '阿拉伯语',
    'hi': '印地语',
    'th': '泰语',
    'vi': '越南语',
    'nl': '荷兰语',
    'pl': '波兰语',
    'tr': '土耳其语',
    'sv': '瑞典语',
    'auto': '原语言'
  };

  static getLanguageName(code) {
    if (!code) return '原语言';
    const norm = code.trim();
    if (this.LANGUAGE_NAMES[norm]) return this.LANGUAGE_NAMES[norm];
    const prefix = norm.split('-')[0].toLowerCase();
    if (this.LANGUAGE_NAMES[prefix]) return this.LANGUAGE_NAMES[prefix];
    return code;
  }

  /**
   * Translate text string via Google Translate gtx free endpoint
   * @param {string} text
   * @param {string} sourceLang (default 'auto')
   * @param {string} targetLang (default 'zh-CN')
   * @returns {Promise<string>}
   */
  static async translateText(text, sourceLang = 'auto', targetLang = 'zh-CN') {
    if (!text || !text.trim()) return '';

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Translation API error: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data[0])) {
      throw new Error('Invalid translation response');
    }

    // Combine all translated sentence parts
    return data[0].map(item => item[0]).join('');
  }

  /**
   * Translate text with detected source language
   */
  static async translateTextDetailed(text, sourceLang = 'auto', targetLang = 'zh-CN') {
    if (!text || !text.trim()) {
      return { translatedText: '', detectedSourceLang: sourceLang };
    }

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Translation API error: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data[0])) {
      throw new Error('Invalid translation response');
    }

    const translatedText = data[0].map(item => item[0]).join('');
    const detectedSourceLang = data[2] || sourceLang;
    return { translatedText, detectedSourceLang };
  }

  /**
   * Batch translate SubtitleCue[]
   * Batches cues together with unique delimiters to minimize network requests
   * @param {Array<{id: number, start: number, end: number, text: string}>} cues
   * @param {Object} options { sourceLang: 'auto', targetLang: 'zh-CN', mode: 'target_only'|'bilingual_zh_en'|'bilingual_en_zh', onProgress?: (percent) => void }
   * @returns {Promise<Array<{id: number, start: number, end: number, text: string}>>}
   */
  static async translateCues(cues, options = {}) {
    if (!Array.isArray(cues) || cues.length === 0) return [];

    const sourceLang = options.sourceLang || 'auto';
    const targetLang = options.targetLang || 'zh-CN';
    const mode = options.mode || 'target_only';
    const BATCH_SIZE = 35; // optimal size for single URL request length
    const DELIMITER = ' ___XYZ___ ';
    const CONCURRENCY = 5;

    const totalBatches = Math.ceil(cues.length / BATCH_SIZE);
    const batches = [];
    for (let b = 0; b < totalBatches; b++) {
      batches.push({
        index: b,
        cues: cues.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE)
      });
    }

    const batchResults = new Array(totalBatches);
    let completedCount = 0;
    let detectedSourceLang = sourceLang;

    // Concurrency pool worker
    const processBatch = async (batchItem) => {
      const { index, cues: batchCues } = batchItem;
      const combinedText = batchCues.map(c => c.text.replace(/\n/g, ' ')).join(DELIMITER);

      const translatedItems = [];
      try {
        let translatedBatch = '';
        if (typeof this.translateTextDetailed === 'function') {
          try {
            const detailed = await this.translateTextDetailed(combinedText, sourceLang, targetLang);
            translatedBatch = detailed.translatedText;
            if (detailed.detectedSourceLang && detailed.detectedSourceLang !== 'auto') {
              detectedSourceLang = detailed.detectedSourceLang;
            }
          } catch (e) {
            translatedBatch = await this.translateText(combinedText, sourceLang, targetLang);
          }
        } else {
          translatedBatch = await this.translateText(combinedText, sourceLang, targetLang);
        }

        const translatedParts = translatedBatch.split(/\s*___XYZ___\s*/i);

        for (let i = 0; i < batchCues.length; i++) {
          const original = batchCues[i];
          const trans = (translatedParts[i] || original.text).trim();

          let finalText = trans;
          if (mode === 'bilingual_zh_en' || mode === 'bilingual') {
            finalText = `${trans}\n${original.text}`;
          } else if (mode === 'bilingual_en_zh') {
            finalText = `${original.text}\n${trans}`;
          }

          translatedItems.push({
            id: original.id,
            start: original.start !== undefined ? original.start : original.startTime,
            end: original.end !== undefined ? original.end : original.endTime,
            text: finalText,
            originalText: original.text
          });
        }
      } catch (err) {
        console.warn(`[SubtitleTranslator] Batch ${index} translation failed, falling back to original:`, err);
        batchCues.forEach(c => translatedItems.push({ ...c }));
      }

      batchResults[index] = translatedItems;
      completedCount++;
      if (typeof options.onProgress === 'function') {
        options.onProgress(Math.round((completedCount / totalBatches) * 100));
      }
    };

    // Execute with worker queue
    let currentIdx = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, batches.length) }, async () => {
      while (currentIdx < batches.length) {
        const item = batches[currentIdx++];
        await processBatch(item);
      }
    });

    await Promise.all(workers);
    const finalCues = batchResults.flat();
    finalCues.detectedSourceLang = detectedSourceLang;
    finalCues.detectedLangName = this.getLanguageName(detectedSourceLang);
    return finalCues;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SubtitleTranslator };
}
if (typeof globalThis !== 'undefined') {
  globalThis.SubtitleTranslator = SubtitleTranslator;
}
