/**
 * Netflix External Subtitle Overlay - Content Script Entry Point
 * 
 * Orchestrates:
 * - NetflixMetadataAdapter (media identification)
 * - VideoController (HTML5 video clock tracking)
 * - SubtitleEngine (cue matching & master clock sync)
 * - SubtitleOverlay (Shadow DOM rendering & HUD toast)
 * - StorageAdapter (persistent offset & subtitle state)
 * - Fully automated subtitle resolution pipeline (auto-search, download, translate)
 */

(() => {
  if (window.__NETFLIX_SUBTITLE_INITIALIZED__) return;
  window.__NETFLIX_SUBTITLE_INITIALIZED__ = true;

  console.log('[Netflix Subtitle Overlay] Initializing automated content script...');

  const engine = new SubtitleEngine();
  const overlay = new SubtitleOverlay();
  const videoCtrl = new VideoController();
  const metadataDetector = new NetflixMetadataAdapter();
  const calibrator = new NativeSubtitleCalibrator(engine, videoCtrl, overlay);

  calibrator.onCalibrated = async (calibInfo) => {
    console.log('[Netflix Subtitle Overlay] Native timeline calibration applied:', calibInfo);
    await saveCurrentEpisodeSync();
  };

  let activeFilename = '';
  let isAutoSearching = false;
  let lastAutoSearchedKey = '';
  let lastAutoSearchedVideoId = '';
  let activeVideoId = NetflixMetadataAdapter.extractVideoId();
  let lastMonitoredVideoId = activeVideoId;

  function formatOffset(offset) {
    const sign = offset >= 0 ? '+' : '';
    return `${sign}${offset.toFixed(1)} s`;
  }

  function isPlaceholderTitle(t) {
    if (!t || typeof t !== 'string') return true;
    return /^(?:netflix|prime|crave|disney\+?|max|hbo|youtube|media)\s*video\s*\d+/i.test(t) ||
           /^(?:netflix|prime|crave|disney\+?|max|hbo|youtube|media)\s*player/i.test(t);
  }

  // Instant wipe and recovery when user changes films or episodes in Netflix
  function handleFilmOrEpisodeTransition(newVideoId, oldVideoId = null) {
    console.log(`[Netflix Subtitle Overlay] Film transition detected (${oldVideoId || 'init'} -> ${newVideoId}). Clearing old subtitles immediately.`);
    // 1. Instantly clear subtitles from engine and overlay so old subtitles NEVER leak!
    engine.clear();
    overlay.renderText('');
    activeFilename = '';
    lastAutoSearchedKey = '';
    lastAutoSearchedVideoId = '';
    activeVideoId = newVideoId;
    if (calibrator) {
      calibrator.lastCalibratedTime = 0;
    }

    // 2. Clear detector manual override so it doesn't carry over to the new film
    metadataDetector.manualOverrideTitle = null;
    metadataDetector.manualOverrideVideoId = null;

    // 3. Clear bridge dataset if it still contains old video data
    if (oldVideoId && document.documentElement && document.documentElement.dataset) {
      if (document.documentElement.dataset.netflixVideoid === oldVideoId) {
        delete document.documentElement.dataset.netflixTitle;
        delete document.documentElement.dataset.netflixSeason;
        delete document.documentElement.dataset.netflixEpisode;
        delete document.documentElement.dataset.netflixType;
        delete document.documentElement.dataset.netflixVideoid;
      }
    }

    // 4. Reset detector identity to force fresh re-detection
    metadataDetector.currentIdentity = null;

    // 5. Trigger new detection and auto-resolve for the new film
    setTimeout(() => {
      metadataDetector.check();
      tryAutoResolveSubtitles(true);
    }, 300);
  }

  // Fast URL watcher for Netflix SPA client-side route transitions
  setInterval(() => {
    const currentVid = NetflixMetadataAdapter.extractVideoId();
    if (currentVid && lastMonitoredVideoId && currentVid !== lastMonitoredVideoId) {
      const oldVid = lastMonitoredVideoId;
      lastMonitoredVideoId = currentVid;
      handleFilmOrEpisodeTransition(currentVid, oldVid);
    } else if (currentVid && !lastMonitoredVideoId) {
      lastMonitoredVideoId = currentVid;
    }
  }, 350);

  window.addEventListener('popstate', () => {
    const currentVid = NetflixMetadataAdapter.extractVideoId();
    if (currentVid && lastMonitoredVideoId && currentVid !== lastMonitoredVideoId) {
      const oldVid = lastMonitoredVideoId;
      lastMonitoredVideoId = currentVid;
      handleFilmOrEpisodeTransition(currentVid, oldVid);
    }
  });

  // 1. SubtitleEngine listener
  engine.onCueChange((text) => {
    overlay.renderText(text);
  });

  // 2. VideoController listeners
  videoCtrl.on('timeUpdate', (time) => {
    if (overlay.settings.enabled === false) return;
    engine.update(time);
  });

  videoCtrl.on('videoAttached', async () => {
    overlay.mount();
    const settings = await StorageAdapter.getSettings();
    overlay.applySettings(settings);
    calibrator.enabled = settings.autoCalibrateNative !== false;
    calibrator.start();
    engine.update(videoCtrl.getCurrentTime(), true);

    const currentVid = NetflixMetadataAdapter.extractVideoId();
    if (currentVid && activeVideoId && activeVideoId !== currentVid) {
      handleFilmOrEpisodeTransition(currentVid, activeVideoId);
    } else if (currentVid) {
      activeVideoId = currentVid;
    }

    // When video starts/mounts, attempt auto-resolution
    tryAutoResolveSubtitles();
  });

  videoCtrl.on('videoDetached', () => {
    calibrator.stop();
  });

  // Helper to ensure media title is accurately resolved before querying subtitle providers
  async function ensureResolvedMedia() {
    let media = metadataDetector.detect();
    const videoId = media?.videoId || NetflixMetadataAdapter.extractVideoId();

    if (!media && videoId) {
      media = { title: `Netflix Video ${videoId}`, videoId, type: 'movie' };
    }
    if (!media) return null;

    // 1. Check persistent storage for remembered title for this specific videoId!
    if (videoId) {
      const persistedTitle = await StorageAdapter.getCachedTitle(videoId);
      if (persistedTitle && NetflixMetadataAdapter.isValidTitle(persistedTitle)) {
        // If detector found a real DOM title that contradicts persistedTitle, update cache!
        if (media.title && NetflixMetadataAdapter.isValidTitle(media.title) && !isPlaceholderTitle(media.title) && media.title !== persistedTitle) {
          console.log(`[Netflix Subtitle Overlay] Updating cached title for video ${videoId}: "${persistedTitle}" -> "${media.title}"`);
          await StorageAdapter.saveCachedTitle(videoId, media.title);
          NetflixMetadataAdapter.videoTitleCache.set(videoId, media.title);
          return media;
        }
        media.title = persistedTitle;
        metadataDetector.manualOverrideTitle = persistedTitle;
        metadataDetector.manualOverrideVideoId = videoId;
        NetflixMetadataAdapter.videoTitleCache.set(videoId, persistedTitle);
        return media;
      }
    }

    // 2. Check DOM data attribute set by page-bridge (MUST match current videoId!)
    if (document.documentElement && document.documentElement.dataset && document.documentElement.dataset.netflixTitle) {
      const bridgeVid = document.documentElement.dataset.netflixVideoid;
      if (!bridgeVid || bridgeVid === videoId) {
        const dt = document.documentElement.dataset.netflixTitle.trim();
        if (dt && NetflixMetadataAdapter.isValidTitle(dt)) {
          media.title = dt;
          if (videoId) {
            NetflixMetadataAdapter.videoTitleCache.set(videoId, dt);
            await StorageAdapter.saveCachedTitle(videoId, dt);
          }
          return media;
        }
      }
    }

    // 3. Check memory cache
    if (media.title && (media.title.startsWith('Netflix Video') || !NetflixMetadataAdapter.isValidTitle(media.title)) && videoId) {
      if (NetflixMetadataAdapter.videoTitleCache.has(videoId)) {
        const cached = NetflixMetadataAdapter.videoTitleCache.get(videoId);
        if (cached && NetflixMetadataAdapter.isValidTitle(cached)) {
          media.title = cached;
          return media;
        }
      }
    }

    return media;
  }

  // Listen to page-bridge metadata event for instant auto-search
  window.addEventListener('NETFLIX_METADATA_DISCOVERED', async (e) => {
    if (e.detail && e.detail.title && NetflixMetadataAdapter.isValidTitle(e.detail.title)) {
      if (e.detail.videoId) {
        NetflixMetadataAdapter.videoTitleCache.set(e.detail.videoId, e.detail.title);
        await StorageAdapter.saveCachedTitle(e.detail.videoId, e.detail.title);
      }
      if (engine.cues.length === 0) {
        console.log('[Netflix Subtitle Overlay] PageBridge discovered title:', e.detail.title, '- triggering auto search');
        tryAutoResolveSubtitles(true);
      }
    }
  });

  // 3. Automated Subtitle Resolution Function
  let activeAutoSearchPromise = null;

  async function tryAutoResolveSubtitles(force = false, retryCount = 0) {
    if (activeAutoSearchPromise && !force) {
      console.log('[Netflix Subtitle Overlay] Auto-search already in progress, awaiting existing promise...');
      return await activeAutoSearchPromise;
    }

    const currentPromise = _executeAutoResolve(force, retryCount);
    activeAutoSearchPromise = currentPromise;
    try {
      return await currentPromise;
    } finally {
      if (activeAutoSearchPromise === currentPromise) {
        activeAutoSearchPromise = null;
      }
    }
  }

  async function _executeAutoResolve(force = false, retryCount = 0) {
    const settings = await StorageAdapter.getSettings();
    if (settings.enabled === false && !force) return { success: false, reason: 'disabled' };
    if (!settings.autoSearch && !force) return { success: false, reason: 'autoSearch_off' };

    const media = await ensureResolvedMedia();
    const videoId = media?.videoId || NetflixMetadataAdapter.extractVideoId();

    // Verification check: ensure we don't have lingering subtitles from a different video
    if (videoId && activeVideoId && activeVideoId !== videoId) {
      console.log(`[Netflix Subtitle Overlay] Active video mismatch (${activeVideoId} vs ${videoId}). Clearing engine.`);
      engine.clear();
      overlay.renderText('');
      activeFilename = '';
      activeVideoId = videoId;
    } else if (videoId) {
      activeVideoId = videoId;
    }

    const mediaKey = media ? StorageAdapter.getMediaKey(media) : '';

    // 1. Check if we have cached subtitles in persistent storage first!
    if (!force) {
      const cachedSub = await StorageAdapter.getEpisodeSubtitles(mediaKey, videoId);
      if (cachedSub && cachedSub.cues && cachedSub.cues.length > 0) {
        if (!videoId || !cachedSub.videoId || String(cachedSub.videoId) === String(videoId)) {
          console.log('[Netflix Subtitle Overlay] Restoring cached subtitles for', mediaKey || videoId);
          activeFilename = cachedSub.filename;
          engine.loadCues(cachedSub.cues, { filename: activeFilename });
          if (typeof cachedSub.offset === 'number') {
            engine.setOffset(cachedSub.offset);
          }
          engine.update(videoCtrl.getCurrentTime(), true);
          overlay.showHud(`✓ 已恢复已保存字幕 (${cachedSub.cues.length} 句)`);
          return {
            success: true,
            cuesCount: cachedSub.cues.length,
            filename: activeFilename,
            fromCache: true
          };
        }
      }
    }

    if (!media || !media.title || !NetflixMetadataAdapter.isValidTitle(media.title) || isPlaceholderTitle(media.title)) {
      if (retryCount < 4) {
        await new Promise(r => setTimeout(r, 600 * (retryCount + 1)));
        return await _executeAutoResolve(force, retryCount + 1);
      }
      return { success: false, error: '未识别到影片片名，请在面板上方手动输入' };
    }

    if (!mediaKey) return { success: false, error: '无法生成影片特征标识' };

    // Avoid duplicate searches for same video and mediaKey unless forced
    if (!force && lastAutoSearchedVideoId === videoId && lastAutoSearchedKey === mediaKey && engine.cues.length > 0) {
      return { success: true, cuesCount: engine.cues.length, filename: activeFilename };
    }

    lastAutoSearchedVideoId = videoId;
    lastAutoSearchedKey = mediaKey;

    const targetLang = settings.targetLanguage || settings.primaryLanguage || 'zh-CN';
    const targetLangName = SubtitleTranslator.getLanguageName(targetLang);
    overlay.showHud(`🔍 正在检索${targetLangName}字幕: ${media.title}...`);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AUTO_FETCH_SUBTITLES',
        payload: {
          media,
          options: {
            targetLang,
            displayMode: settings.displayMode || 'bilingual_zh_en'
          }
        }
      });

      if (response && response.success && response.cues && response.cues.length > 0) {
        activeFilename = response.filename;
        engine.loadCues(response.cues, { filename: activeFilename });
        engine.update(videoCtrl.getCurrentTime(), true);

        let label = '';
        if (response.isTranslated) {
          const srcName = response.sourceLangName || '原语言';
          const tgtName = response.targetLangName || targetLangName;
          label = `✓ 未找到${tgtName}字幕，已识别[${srcName}]翻译为${tgtName}`;
        } else {
          const tgtName = response.targetLangName || targetLangName;
          label = `✓ 已自动加载${tgtName}字幕`;
        }
        overlay.showHud(`${label} (${response.cues.length} 句)`);

        // Check persistent offset
        const cached = await StorageAdapter.getEpisodeSync(mediaKey);
        if (cached && typeof cached.offset === 'number') {
          engine.setOffset(cached.offset);
        } else {
          await saveCurrentEpisodeSync();
        }

        // Cache the subtitle cues for instant offline / refresh recovery!
        const vid = videoId || media?.videoId || NetflixMetadataAdapter.extractVideoId();
        await StorageAdapter.saveEpisodeSubtitles(mediaKey, {
          cues: response.cues,
          filename: activeFilename,
          offset: engine.getOffset(),
          isTranslated: response.isTranslated,
          videoId: vid,
          title: media?.title || ''
        });

        return {
          success: true,
          cuesCount: response.cues.length,
          filename: activeFilename,
          isTranslated: response.isTranslated
        };
      } else {
        const errorMsg = response?.error || '未检索到匹配字幕，可在搜索页尝试其他片名关键词';
        overlay.showHud(`⚠️ ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      console.warn('[Netflix Subtitle Overlay] Auto resolve error:', err);
      const msg = err.message || '网络请求超时';
      overlay.showHud(`⚠️ 字幕检索异常: ${msg}`);
      return { success: false, error: msg };
    }
  }

  // 4. Keyboard Shortcuts for Real-Time Sync Calibration & Toggle
  window.addEventListener('keydown', (e) => {
    if (!e.altKey) return;

    // Alt + Q: Instant toggle extension on/off
    if (e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      e.stopPropagation();
      const currentEnabled = overlay.settings.enabled !== false;
      const nextEnabled = !currentEnabled;
      StorageAdapter.saveSettings({ enabled: nextEnabled }).then(() => {
        overlay.applySettings({ enabled: nextEnabled });
        if (nextEnabled) {
          engine.update(videoCtrl.getCurrentTime(), true);
          overlay.showHud('✓ 字幕已开启 (Alt+Q)');
        } else {
          overlay.showHud('已关闭字幕 (Alt+Q)');
        }
      });
      return;
    }

    let delta = 0;
    if (e.key === 'ArrowLeft') {
      delta = e.shiftKey ? -1.0 : -0.1;
    } else if (e.key === 'ArrowRight') {
      delta = e.shiftKey ? 1.0 : 0.1;
    }

    if (delta !== 0) {
      e.preventDefault();
      e.stopPropagation();

      const newOffset = engine.adjustOffset(delta);
      const msg = `Subtitle offset: ${formatOffset(newOffset)}`;
      overlay.showHud(msg);

      saveCurrentEpisodeSync();
    }
  }, true);

  async function saveCurrentEpisodeSync() {
    const media = metadataDetector.detect();
    if (!media) return;
    const mediaKey = StorageAdapter.getMediaKey(media);
    if (!mediaKey) return;

    await StorageAdapter.saveEpisodeSync(mediaKey, {
      offset: engine.getOffset(),
      subtitleName: activeFilename,
      cuesCount: engine.cues.length
    });
  }

  // 5. Episode & Media change detection
  metadataDetector.onIdentityChange(async (currentIdentity, prevIdentity) => {
    console.log('[Netflix Subtitle Overlay] Detected media transition:', currentIdentity);

    const isVideoChanged = prevIdentity && (
      prevIdentity.videoId !== currentIdentity.videoId ||
      prevIdentity.season !== currentIdentity.season ||
      prevIdentity.episode !== currentIdentity.episode
    );

    if (isVideoChanged) {
      console.log(`[Netflix Subtitle Overlay] Film/Episode changed from "${prevIdentity?.title}" (${prevIdentity?.videoId}) to "${currentIdentity?.title}" (${currentIdentity?.videoId}). Auto-clearing old subtitles.`);
      // Instantly wipe old subtitles so they never leak into the new film!
      engine.clear();
      overlay.renderText('');
      activeFilename = '';
      lastAutoSearchedKey = '';
      lastAutoSearchedVideoId = '';
      activeVideoId = currentIdentity.videoId;
      lastMonitoredVideoId = currentIdentity.videoId;

      // Check persistent cache first
      const mediaKey = StorageAdapter.getMediaKey(currentIdentity);
      if (mediaKey) {
        const cached = await StorageAdapter.getEpisodeSync(mediaKey);
        if (cached && typeof cached.offset === 'number') {
          engine.setOffset(cached.offset);
        }
      }

      // Automatically search/restore for new episode!
      setTimeout(() => {
        tryAutoResolveSubtitles(true);
      }, 300);
      return;
    }

    // If same videoId/episode, but title was resolved from placeholder (e.g. Netflix Video 123 -> The Thicket)
    if (prevIdentity && prevIdentity.title !== currentIdentity.title) {
      console.log(`[Netflix Subtitle Overlay] Title resolved from "${prevIdentity.title}" to "${currentIdentity.title}".`);
      lastAutoSearchedKey = '';
      setTimeout(() => {
        tryAutoResolveSubtitles(true);
      }, 300);
      return;
    }
  });

  // 6. Startup initialization
  async function init() {
    try {
      await NetflixMetadataAdapter.preloadCache();
      overlay.mount();
      const settings = await StorageAdapter.getSettings();
      overlay.applySettings(settings);
      calibrator.enabled = settings.autoCalibrateNative !== false;
      videoCtrl.start();
      metadataDetector.startWatching();

      const initialVid = NetflixMetadataAdapter.extractVideoId();
      if (initialVid) {
        activeVideoId = initialVid;
        lastMonitoredVideoId = initialVid;
      }

      setTimeout(() => tryAutoResolveSubtitles(), 400);
    } catch (err) {
      console.error('[Netflix Subtitle Overlay] Init error:', err);
    }
  }

  // 7. Message passing
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handleMessage = async () => {
      switch (message.type) {
        case 'PING': {
          return { success: true, pong: true };
        }

        case 'GET_STATE': {
          let media = null;
          try {
            media = await ensureResolvedMedia();
          } catch (e) {
            console.warn('[Netflix Subtitle Overlay] Metadata detection error:', e);
          }

          const videoInfo = {
            currentTime: videoCtrl.getCurrentTime(),
            duration: videoCtrl.getDuration(),
            paused: videoCtrl.isPaused(),
            playbackRate: videoCtrl.getPlaybackRate(),
            hasVideo: !!videoCtrl.getVideo()
          };
          const engineStatus = engine.getStatus();
          const settings = await StorageAdapter.getSettings();

          return {
            success: true,
            media,
            video: videoInfo,
            engine: {
              ...engineStatus,
              activeFilename
            },
            calibrator: {
              enabled: calibrator.enabled,
              lastCalibratedTime: calibrator.lastCalibratedTime
            },
            settings
          };
        }

        case 'TRIGGER_AUTO_SEARCH': {
          const res = await tryAutoResolveSubtitles(true);
          return res || { success: engine.cues.length > 0, cuesCount: engine.cues.length };
        }

        case 'SET_MANUAL_TITLE': {
          const { title } = message.payload;
          if (title && title.trim()) {
            const clean = title.trim();
            await metadataDetector.setManualTitle(clean);
            const videoId = NetflixMetadataAdapter.extractVideoId();
            if (videoId) {
              await StorageAdapter.saveCachedTitle(videoId, clean);
            }
            lastAutoSearchedKey = '';
            const res = await tryAutoResolveSubtitles(true);
            return res || { success: engine.cues.length > 0, cuesCount: engine.cues.length };
          }
          return { success: false, error: '片名为空' };
        }

        case 'LOAD_SUBTITLES': {
          const { content, format, filename, offset } = message.payload;
          let cues = [];

          if (format === 'vtt' || (filename && filename.endsWith('.vtt'))) {
            cues = VttParser.parse(content);
          } else {
            cues = SrtParser.parse(content);
          }

          if (cues.length === 0) {
            return { success: false, error: 'No valid subtitle cues found in file.' };
          }

          activeFilename = filename || 'custom_subtitle.srt';
          engine.loadCues(cues, { filename: activeFilename });

          if (typeof offset === 'number') {
            engine.setOffset(offset);
          }

          engine.update(videoCtrl.getCurrentTime(), true);
          overlay.showHud(`已加载 ${cues.length} 句字幕`);
          await saveCurrentEpisodeSync();

          const media = await ensureResolvedMedia();
          const vid = media?.videoId || NetflixMetadataAdapter.extractVideoId();
          if (media) {
            const mediaKey = StorageAdapter.getMediaKey(media);
            if (mediaKey || vid) {
              await StorageAdapter.saveEpisodeSubtitles(mediaKey, {
                cues,
                filename: activeFilename,
                offset: engine.getOffset(),
                isTranslated: false,
                videoId: vid,
                title: media.title || ''
              });
            }
          }

          return {
            success: true,
            cuesCount: cues.length,
            filename: activeFilename,
            offset: engine.getOffset()
          };
        }

        case 'SET_OFFSET': {
          const { offset, delta } = message.payload;
          if (typeof offset === 'number') {
            engine.setOffset(offset);
          } else if (typeof delta === 'number') {
            engine.adjustOffset(delta);
          }

          const currentOffset = engine.getOffset();
          overlay.showHud(`Subtitle offset: ${formatOffset(currentOffset)}`);
          await saveCurrentEpisodeSync();

          return { success: true, offset: currentOffset };
        }

        case 'CLEAR_SUBTITLES': {
          engine.clear();
          overlay.renderText('');
          activeFilename = '';
          overlay.showHud('字幕已清空');
          return { success: true };
        }

        case 'CALIBRATE_FROM_NATIVE': {
          const result = calibrator.manualCalibrate();
          if (result.success) {
            await saveCurrentEpisodeSync();
            const sign = result.delta >= 0 ? '+' : '';
            overlay.showHud(`🎯 时间轴已校准: ${sign}${result.delta.toFixed(1)}s (当前偏移: ${result.newOffset >= 0 ? '+' : ''}${result.newOffset.toFixed(1)}s)`);
          }
          return result;
        }

        case 'UPDATE_SETTINGS': {
          const newSettings = message.payload;
          await StorageAdapter.saveSettings(newSettings);
          overlay.applySettings(newSettings);
          if (calibrator) {
            calibrator.enabled = newSettings.autoCalibrateNative !== false;
          }
          if (newSettings.enabled === false) {
            overlay.renderText('');
          } else if (videoCtrl && engine) {
            engine.lastRenderedText = null;
            engine.update(videoCtrl.getCurrentTime(), true);
          }
          return { success: true, settings: newSettings };
        }

        default:
          return { success: false, error: `Unknown message type: ${message.type}` };
      }
    };

    handleMessage()
      .then(response => sendResponse(response))
      .catch(err => sendResponse({ success: false, error: err.message }));

    return true;
  });

  init();
})();
