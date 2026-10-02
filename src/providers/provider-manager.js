/**
 * ProviderManager - Multi-source automated subtitle orchestrator
 * 
 * Auto-search pipeline:
 * 1. Search for target language (e.g. Chinese Simplified) across providers (SubDL, OpenSubtitles)
 * 2. If found, rank and return top match
 * 3. If NOT found: automatically search for English subtitles, download, and translate to Chinese using SubtitleTranslator
 */

var SubdlClass = (typeof SubdlAdapter !== 'undefined')
  ? SubdlAdapter
  : require('./subdl.js').SubdlAdapter;

var OpenSubClass = (typeof OpenSubtitlesAdapter !== 'undefined')
  ? OpenSubtitlesAdapter
  : require('./opensubtitles.js').OpenSubtitlesAdapter;

var PublicSubsClass = (typeof PublicSubsAdapter !== 'undefined')
  ? PublicSubsAdapter
  : require('./public-subs.js').PublicSubsAdapter;

var RankingClass = (typeof SubtitleRanking !== 'undefined')
  ? SubtitleRanking
  : require('../subtitle/subtitle-ranking.js').SubtitleRanking;

var TranslatorClass = (typeof SubtitleTranslator !== 'undefined')
  ? SubtitleTranslator
  : require('../subtitle/subtitle-translator.js').SubtitleTranslator;

var SrtParserClass = (typeof globalThis !== 'undefined' && globalThis.SrtParser)
  ? globalThis.SrtParser
  : (typeof SrtParser !== 'undefined' ? SrtParser : require('../subtitle/srt-parser.js').SrtParser);

class ProviderManager {
  constructor(settings = {}) {
    this.settings = settings;
    this.publicSubs = new PublicSubsClass();
    this.subdl = new SubdlClass(settings.subdlApiKey || '');
    this.opensubtitles = new OpenSubClass(settings.openSubtitlesApiKey || '');
  }

  updateSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    this.subdl.setApiKey(this.settings.subdlApiKey || '');
    this.opensubtitles.setApiKey(this.settings.openSubtitlesApiKey || '');
  }

  /**
   * Search all providers for a specific language
   */
  async searchLanguage(mediaIdentity, language) {
    const promises = [];

    // 1. Search keyless public subtitle repository
    promises.push(this.publicSubs.search(mediaIdentity, language).catch(() => []));

    // 2. Search SubDL if API key is present
    if (this.settings.subdlApiKey) {
      promises.push(this.subdl.search(mediaIdentity, language).catch(() => []));
    }
    // 3. Search OpenSubtitles if API key is present
    if (this.settings.openSubtitlesApiKey) {
      promises.push(this.opensubtitles.search(mediaIdentity, language).catch(() => []));
    }

    const results = await Promise.all(promises);
    const combined = results.flat();
    return RankingClass.rank(combined, mediaIdentity, language, 10);
  }

  /**
   * Fully automated subtitle resolution
   * @param {Object} mediaIdentity
   * @param {Object} options { targetLang: 'zh-CN', displayMode: 'target_only'|'bilingual_zh_en'|'bilingual_en_zh' }
   * @returns {Promise<{ cues: Array, filename: string, isTranslated: boolean, provider: string }>}
   */
  async autoResolveSubtitles(mediaIdentity, options = {}) {
    const targetLang = options.targetLang || this.settings.targetLanguage || this.settings.primaryLanguage || 'zh-CN';
    const displayMode = options.displayMode || this.settings.displayMode || 'bilingual_zh_en';

    // Step 1: Default to searching & downloading target language subtitles first (e.g. Chinese)
    let candidates = await this.searchLanguage(mediaIdentity, targetLang);
    // Strictly filter to ensure candidates match target language
    let filteredCandidates = candidates.filter(c => RankingClass.isLanguageMatch(c.language || c.lang, targetLang));

    // If searching Chinese Simplified and no results, also check Traditional Chinese (zh-TW)
    if (filteredCandidates.length === 0 && (targetLang === 'zh-CN' || targetLang === 'zh')) {
      const twCandidates = await this.searchLanguage(mediaIdentity, 'zh-TW');
      const filteredTw = twCandidates.filter(c => RankingClass.isLanguageMatch(c.language || c.lang, 'zh-TW'));
      if (filteredTw.length > 0) {
        filteredCandidates = filteredTw;
      }
    }

    for (const topChoice of filteredCandidates.slice(0, 3)) {
      try {
        const rawContent = await this.downloadCandidate(topChoice);
        const cues = SrtParserClass.parse(rawContent);
        if (cues.length > 0) {
          return {
            cues,
            filename: topChoice.release_name || `${mediaIdentity.title}.${targetLang}.srt`,
            isTranslated: false,
            sourceLanguage: targetLang,
            sourceLangName: TranslatorClass.getLanguageName(targetLang),
            targetLanguage: targetLang,
            targetLangName: TranslatorClass.getLanguageName(targetLang),
            provider: topChoice.provider || 'SubDL',
            matchScore: topChoice.matchScore
          };
        }
      } catch (err) {
        console.warn(`[ProviderManager] Failed downloading ${targetLang} subtitle candidate:`, err);
      }
    }

    // Step 2: Target language not found -> Search available original language subtitles and auto-translate
    console.log(`[ProviderManager] Target language (${targetLang}) not found. Falling back to original language auto-translation...`);
    let fallbackCandidates = await this.searchLanguage(mediaIdentity, 'en');
    fallbackCandidates = fallbackCandidates.filter(c => RankingClass.isLanguageMatch(c.language || c.lang, 'en'));

    // If no English candidates, search all available subtitle languages
    if (fallbackCandidates.length === 0) {
      const anyCandidates = await this.searchLanguage(mediaIdentity, 'all');
      if (anyCandidates && anyCandidates.length > 0) {
        fallbackCandidates = anyCandidates;
      }
    }

    for (const topSub of fallbackCandidates.slice(0, 5)) {
      try {
        const rawContent = await this.downloadCandidate(topSub);
        const rawCues = SrtParserClass.parse(rawContent);

        if (rawCues.length > 0) {
          // Verify candidate isn't mislabeled Spanish/Portuguese when searching for English
          const sampleText = rawCues.slice(0, 20).map(c => c.text).join(' ');
          const isMislabeledSpanish = /[¿¡]|\b(?:qué|está|aquí|caballero|señor|también|bueno|dónde|tengo|tienes|gracias|mierda|hablar|ahora|noche|hombre)\b/i.test(sampleText);
          if (isMislabeledSpanish && !RankingClass.isLanguageMatch(targetLang, 'es')) {
            console.warn(`[ProviderManager] Candidate "${topSub.release_name}" contains Spanish markers despite being tagged as ${topSub.language}. Skipping to next candidate.`);
            continue;
          }

          // Batch translate cues into target language (Google Translate auto-detects original source language)
          const translatedCues = await TranslatorClass.translateCues(rawCues, {
            sourceLang: 'auto',
            targetLang: targetLang,
            mode: displayMode
          });

          const detectedLang = translatedCues.detectedSourceLang || topSub.language || 'auto';
          const detectedLangName = translatedCues.detectedLangName || TranslatorClass.getLanguageName(detectedLang);

          return {
            cues: translatedCues,
            filename: `[Auto-Translated] ${topSub.release_name || mediaIdentity.title}.srt`,
            isTranslated: true,
            sourceLanguage: detectedLang,
            sourceLangName: detectedLangName,
            targetLanguage: targetLang,
            targetLangName: TranslatorClass.getLanguageName(targetLang),
            provider: topSub.provider || 'Auto-Translate',
            matchScore: topSub.matchScore
          };
        }
      } catch (err) {
        console.warn('[ProviderManager] Failed translating original subtitle candidate:', err);
      }
    }

    throw new Error('No matching subtitles found for this title.');
  }

  async downloadCandidate(candidate) {
    if (candidate.provider === 'PublicSubs') {
      return await this.publicSubs.download(candidate);
    }
    if (candidate.provider === 'OpenSubtitles') {
      return await this.opensubtitles.download(candidate);
    }
    return await this.subdl.download(candidate);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ProviderManager };
}
if (typeof globalThis !== 'undefined') {
  globalThis.ProviderManager = ProviderManager;
}
