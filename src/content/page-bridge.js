/**
 * Netflix External Subtitle Overlay - Page Bridge (Runs in MAIN world)
 * 
 * Directly accesses page-level `window.netflix` context, Falcor cache,
 * and React fiber metadata to extract genuine movie/series titles.
 */

(() => {
  if (window.__NETFLIX_PAGE_BRIDGE_INITIALIZED__) return;
  window.__NETFLIX_PAGE_BRIDGE_INITIALIZED__ = true;

  function cleanString(str) {
    if (!str || typeof str !== 'string') return '';
    let s = str.trim();
    if (/^(?:netflix|flix|net\s*flix)$/i.test(s)) return '';

    for (let i = 0; i < 3; i++) {
      s = s
        .replace(/^netflix\s*[-–—|:]\s*/i, '')
        .replace(/\s*[-–—|:]\s*netflix.*$/i, '')
        .replace(/\s*\|\s*netflix.*$/i, '')
        .replace(/^(?:[看觀观看]|watch\s+online|watch|online)\s*[：:\s《<“"']*/i, '')
        .replace(/\s*\|\s*watch on netflix.*$/i, '')
        .replace(/[》>”"']+$/g, '')
        .trim();
    }
    const res = s.replace(/["']/g, '').trim();
    if (/^(?:netflix|flix|net\s*flix)$/i.test(res)) return '';
    return res;
  }

  function isValidTitle(str) {
    if (!str || typeof str !== 'string') return false;
    const t = str.trim();
    if (t.length < 2 || t.length > 80) return false;
    if (/^(?:netflix(?:\s*video)?(?:\s*\d+)?|flix|net\s*flix)$/i.test(t)) return false;
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

  function extractMetadata() {
    const videoIdMatch = location.pathname.match(/\/watch\/(\d+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    if (!videoId) return null;

    let title = '';
    let season = undefined;
    let episode = undefined;
    let episodeTitle = undefined;
    let type = 'movie';

    // 1. Try Netflix Falcor / Falkor Cache (Client-side in-memory data store)
    try {
      const falkor = window.netflix?.falkorCache || window.netflix?.falcorCache || window.netflix?.falkor || window.netflix?.falcor;
      const videos = falkor?.videos || window.netflix?.reactContext?.models?.videos || null;
      if (videos) {
        // A. Match current active video ID
        const target = videos[videoId];
        if (target) {
          const t = target.title?.value || target.summary?.value?.title || target.title;
          if (t && typeof t === 'string' && t.trim()) {
            title = cleanString(t);
            season = target.season?.value || target.summary?.value?.season || target.season;
            episode = target.episode?.value || target.summary?.value?.episode || target.episode;
            episodeTitle = target.episodeTitle?.value || target.episodeTitle;
            if (season !== undefined || episode !== undefined) type = 'tv';
          }

          // If target is an episode, trace ancestor to get parent series title
          if ((!title || type === 'tv') && target.ancestor?.value) {
            const parentId = target.ancestor.value[1];
            if (parentId && videos[parentId]) {
              const pt = videos[parentId].title?.value || videos[parentId].summary?.value?.title || videos[parentId].title;
              if (pt && typeof pt === 'string' && pt.trim()) {
                title = cleanString(pt);
                type = 'tv';
              }
            }
          }
        }
      }
    } catch (e) {}

    // 2. Try VideoPlayer API from appContext (strictly match current videoId!)
    if (!title) {
      try {
        const playerApp = window.netflix?.appContext?.state?.playerApp;
        if (playerApp) {
          const api = playerApp.getAPI ? playerApp.getAPI() : null;
          if (api && api.videoPlayer) {
            const sids = api.videoPlayer.getAllPlayerSessionIds ? api.videoPlayer.getAllPlayerSessionIds() : [];
            const cacheVideos = (window.netflix?.falkorCache || window.netflix?.falcorCache)?.videos;
            for (const sid of sids) {
              const p = api.videoPlayer.getVideoPlayerBySessionId(sid);
              if (p) {
                const movieId = p.getMovieId ? p.getMovieId() : null;
                // STRICT CHECK: Player movieId MUST match current URL videoId!
                if (movieId && String(movieId) === String(videoId) && cacheVideos && cacheVideos[movieId]) {
                  const item = cacheVideos[movieId];
                  const t = item.title?.value || item.summary?.value?.title || item.title;
                  if (t && typeof t === 'string') {
                    const cleaned = cleanString(t);
                    if (cleaned && isValidTitle(cleaned)) {
                      title = cleaned;
                      break;
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) {}
    }

    // 3. Try React Fiber extraction from DOM player view
    if (!title) {
      try {
        const root = document.querySelector('.watch-video--player-view') || document.querySelector('[data-uia="video-title"]');
        if (root) {
          const key = Object.keys(root).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$'));
          if (key) {
            let node = root[key];
            let depth = 0;
            while (node && depth < 30) {
              if (node.memoizedProps) {
                const p = node.memoizedProps;
                if (p.videoTitle && typeof p.videoTitle === 'string') {
                  const c = cleanString(p.videoTitle);
                  if (c && isValidTitle(c)) {
                    title = c;
                    break;
                  }
                }
                if (p.title && typeof p.title === 'string' && !p.title.startsWith('Netflix Video')) {
                  const c = cleanString(p.title);
                  if (c && isValidTitle(c)) {
                    title = c;
                    break;
                  }
                }
              }
              node = node.return;
              depth++;
            }
          }
        }
      } catch (e) {}
    }

    if (title && isValidTitle(title)) {
      const metadata = {
        title,
        season,
        episode,
        episodeTitle,
        type,
        videoId
      };

      // Write directly onto documentElement data attributes for instant synchronous reading by content script
      document.documentElement.dataset.netflixTitle = title;
      if (season !== undefined) document.documentElement.dataset.netflixSeason = String(season);
      if (episode !== undefined) document.documentElement.dataset.netflixEpisode = String(episode);
      document.documentElement.dataset.netflixType = type;
      document.documentElement.dataset.netflixVideoid = videoId;

      window.dispatchEvent(new CustomEvent('NETFLIX_METADATA_DISCOVERED', {
        detail: metadata
      }));

      return metadata;
    }

    return null;
  }

  let lastBridgeVideoId = null;
  let pollInterval = null;

  function clearBridgeDataset() {
    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset) {
      delete document.documentElement.dataset.netflixTitle;
      delete document.documentElement.dataset.netflixSeason;
      delete document.documentElement.dataset.netflixEpisode;
      delete document.documentElement.dataset.netflixType;
      delete document.documentElement.dataset.netflixVideoid;
    }
  }

  function startPolling(isFast = false) {
    if (pollInterval) clearInterval(pollInterval);
    const intervalMs = isFast ? 400 : 2500;
    pollInterval = setInterval(() => {
      const meta = extractMetadata();
      if (meta && meta.title && isFast) {
        // Once title for this video is found, slow down to normal polling
        startPolling(false);
      }
    }, intervalMs);
  }

  function handleNavigationChange() {
    const videoIdMatch = location.pathname.match(/\/watch\/(\d+)/);
    const currentVideoId = videoIdMatch ? videoIdMatch[1] : null;
    if (currentVideoId && currentVideoId !== lastBridgeVideoId) {
      lastBridgeVideoId = currentVideoId;
      clearBridgeDataset();
      startPolling(true);
      setTimeout(extractMetadata, 200);
    }
  }

  // Intercept HTML5 History API for SPA navigation
  const origPush = history.pushState;
  history.pushState = function(...args) {
    const ret = origPush.apply(this, args);
    setTimeout(handleNavigationChange, 50);
    return ret;
  };
  const origReplace = history.replaceState;
  history.replaceState = function(...args) {
    const ret = origReplace.apply(this, args);
    setTimeout(handleNavigationChange, 50);
    return ret;
  };
  window.addEventListener('popstate', () => {
    setTimeout(handleNavigationChange, 50);
  });

  // Initial startup
  const initialMatch = location.pathname.match(/\/watch\/(\d+)/);
  lastBridgeVideoId = initialMatch ? initialMatch[1] : null;
  startPolling(true);
})();
