/**
 * Netflix External Subtitle Overlay - Background Service Worker (Manifest V3)
 * 
 * Responsibilities:
 * - Automated multi-source subtitle search and download
 * - Automatic English-to-Chinese subtitle batch translation (Phase 2 & 3)
 * - Persistent storage defaults & lifecycle management
 */

importScripts(
  '../storage/storage.js',
  '../subtitle/srt-parser.js',
  '../subtitle/vtt-parser.js',
  '../subtitle/subtitle-ranking.js',
  '../subtitle/subtitle-translator.js',
  '../providers/provider.js',
  '../providers/subdl.js',
  '../providers/opensubtitles.js',
  '../providers/public-subs.js',
  '../providers/provider-manager.js'
);

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Background SW] Extension installed/updated:', details.reason);
  const currentSettings = await StorageAdapter.getSettings();
  await StorageAdapter.saveSettings(currentSettings);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const settings = await StorageAdapter.getSettings();
      const manager = new ProviderManager(settings);

      switch (message.type) {
        // Auto-search, rank, download, and auto-translate if needed
        case 'AUTO_FETCH_SUBTITLES': {
          const { media, options } = message.payload;
          console.log('[Background SW] Auto-resolving subtitles for:', media);

          const result = await manager.autoResolveSubtitles(media, options);

          // Cache resolved subtitles per episode
          const mediaKey = StorageAdapter.getMediaKey(media);
          if (mediaKey) {
            await StorageAdapter.saveEpisodeSync(mediaKey, {
              subtitleName: result.filename,
              cuesCount: result.cues.length,
              isTranslated: result.isTranslated,
              provider: result.provider
            });
          }

          sendResponse({
            success: true,
            cues: result.cues,
            filename: result.filename,
            isTranslated: result.isTranslated,
            sourceLanguage: result.sourceLanguage,
            sourceLangName: result.sourceLangName,
            targetLanguage: result.targetLanguage,
            targetLangName: result.targetLangName,
            provider: result.provider,
            matchScore: result.matchScore
          });
          break;
        }

        // Subtitle manual search with intelligent fallback
        case 'SUBDL_SEARCH': {
          const { media, language } = message.payload;
          let ranked = await manager.searchLanguage(media, language || settings.primaryLanguage);

          let fallbackToEnglish = false;
          // If user searched for Chinese but 0 results found, automatically fetch English candidates as fallback!
          if ((!ranked || ranked.length === 0) && (language || '').startsWith('zh')) {
            console.log('[Background SW] 0 Chinese subtitles found in search, fetching English fallback...');
            const enRanked = await manager.searchLanguage(media, 'en');
            if (enRanked && enRanked.length > 0) {
              ranked = enRanked;
              fallbackToEnglish = true;
            }
          }

          sendResponse({
            success: true,
            results: ranked,
            fallbackToEnglish
          });
          break;
        }

        // Test API Key validity
        case 'TEST_API_KEY': {
          const { provider, apiKey } = message.payload;
          if (provider === 'subdl') {
            const testResult = await SubdlAdapter.testConnection(apiKey);
            sendResponse(testResult);
          } else if (provider === 'opensubtitles') {
            const testResult = await OpenSubtitlesAdapter.testConnection(apiKey);
            sendResponse(testResult);
          } else {
            sendResponse({ success: false, error: 'Unknown provider' });
          }
          break;
        }

        // Direct download (with optional auto-translation)
        case 'SUBDL_DOWNLOAD': {
          const { result, translate, targetLang, mode } = message.payload;
          let content = await manager.downloadCandidate(result);
          let filename = result.release_name ? `${result.release_name}.srt` : 'downloaded_subtitle.srt';

          if (translate) {
            const rawCues = SrtParser.parse(content);
            const translatedCues = await SubtitleTranslator.translateCues(rawCues, {
              targetLang: targetLang || settings.primaryLanguage || 'zh-CN',
              mode: mode || settings.displayMode || 'bilingual_zh_en'
            });

            // Re-format into valid SRT
            const formatTime = (sec) => {
              const s = Math.max(0, sec || 0);
              const hrs = String(Math.floor(s / 3600)).padStart(2, '0');
              const mins = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
              const secs = String(Math.floor(s % 60)).padStart(2, '0');
              const ms = String(Math.floor((s % 1) * 1000)).padStart(3, '0');
              return `${hrs}:${mins}:${secs},${ms}`;
            };

            content = translatedCues.map((c, idx) => {
              return `${idx + 1}\n${formatTime(c.start)} --> ${formatTime(c.end)}\n${c.text}\n`;
            }).join('\n');

            filename = `[Translated] ${filename}`;
          }

          sendResponse({
            success: true,
            content,
            filename
          });
          break;
        }

        // Translate arbitrary cues (e.g. from Netflix native track)
        case 'TRANSLATE_CUES': {
          const { cues, mode, targetLang } = message.payload;
          const translated = await SubtitleTranslator.translateCues(cues, {
            targetLang: targetLang || settings.primaryLanguage || 'zh-CN',
            mode: mode || settings.displayMode || 'target_only'
          });
          sendResponse({ success: true, cues: translated });
          break;
        }

        default:
          sendResponse({ success: false, error: `Unhandled background message: ${message.type}` });
          break;
      }
    } catch (err) {
      console.error('[Background SW] Error handling message:', err);
      sendResponse({ success: false, error: err.message || 'Unknown error occurred' });
    }
  })();

  return true; // Keep channel open for async response
});
