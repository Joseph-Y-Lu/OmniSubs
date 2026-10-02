/**
 * Netflix Subtitle Overlay - Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const statusIndicator = document.getElementById('connection-status');
  const mediaTitleEl = document.getElementById('media-title');
  const mediaBadgeEl = document.getElementById('media-badge');
  const subStatusEl = document.getElementById('sub-status');
  const playbackTimeEl = document.getElementById('video-playback-time');
  const btnTriggerAutoSearch = document.getElementById('btn-trigger-auto-search');

  // Tabs
  const tabButtons = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Local File
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const btnBrowseFile = document.getElementById('btn-browse-file');
  const btnClearSubtitle = document.getElementById('btn-clear-subtitle');

  // Search
  const searchTitleInput = document.getElementById('search-title');
  const searchLangSelect = document.getElementById('search-language');
  const btnSearchSubdl = document.getElementById('btn-search-subdl');
  const searchResultsContainer = document.getElementById('search-results-container');
  const searchEmptyState = document.getElementById('search-empty-state');
  const searchResultsList = document.getElementById('search-results-list');

  // Offset
  const offsetDisplayText = document.getElementById('offset-display-text');
  const btnStepMinus1 = document.getElementById('btn-step-minus-1');
  const btnStepMinus01 = document.getElementById('btn-step-minus-01');
  const btnStepReset = document.getElementById('btn-step-reset');
  const btnStepPlus01 = document.getElementById('btn-step-plus-01');
  const btnStepPlus1 = document.getElementById('btn-step-plus-1');

  // Master Switch & Banner Elements
  const masterPowerToggle = document.getElementById('master-power-toggle');
  const masterPowerText = document.getElementById('master-power-text');
  const masterPowerWrap = document.getElementById('master-power-wrap');
  const disabledBanner = document.getElementById('disabled-banner');
  const settingMasterEnabled = document.getElementById('setting-master-enabled');

  // Settings & Appearance
  const checkAutoSearch = document.getElementById('setting-auto-search');
  const displayModeButtons = document.querySelectorAll('#control-display-mode .segment-btn');
  const positionButtons = document.querySelectorAll('#control-position .segment-btn');
  const sliderFontSize = document.getElementById('slider-font-size');
  const valFontSize = document.getElementById('val-font-size');
  const sliderBottomOffset = document.getElementById('slider-bottom-offset');
  const valBottomOffset = document.getElementById('val-bottom-offset');
  const colorButtons = document.querySelectorAll('#control-text-color .color-btn');
  const presetButtons = document.querySelectorAll('#control-style-preset .segment-btn');
  const selectFontFamily = document.getElementById('select-font-family');
  const checkShowBackground = document.getElementById('setting-show-background');
  const checkRemember = document.getElementById('setting-remember');
  const inputSubdlKey = document.getElementById('setting-subdl-key');
  const inputOpensubtitlesKey = document.getElementById('setting-opensubtitles-key');
  const btnSaveApiKey = document.getElementById('btn-save-api-key');
  const selectTargetLanguage = document.getElementById('setting-target-language');
  const platformBadgeEl = document.getElementById('platform-badge');

  // Smart Calibrator elements (Prime Video, Crave ad auto-alignment)
  const btnCalibrateNative = document.getElementById('btn-calibrate-native');
  const calibrationResultEl = document.getElementById('calibration-result');
  const calibratorBadgeEl = document.getElementById('calibrator-badge');
  const checkAutoCalibrateNative = document.getElementById('setting-auto-calibrate-native');

  // Preview elements
  const previewStage = document.getElementById('preview-stage');
  const previewSubBox = document.getElementById('preview-sub-box');
  const previewPrimary = document.getElementById('preview-primary');
  const previewSecondary = document.getElementById('preview-secondary');
  const previewModeIndicator = document.getElementById('preview-mode-indicator');

  // Toast
  const toastEl = document.getElementById('popup-toast');

  let activeTabId = null;
  let currentOffset = 0.0;
  let detectedMedia = null;
  let lastDetectedVideoId = null;

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2000);
  }

  function formatSeconds(sec) {
    if (!sec || isNaN(sec)) return '00:00';
    const s = Math.floor(sec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function updateOffsetDisplay(offset) {
    currentOffset = offset;
    const sign = offset >= 0 ? '+' : '';
    offsetDisplayText.textContent = `${sign}${offset.toFixed(1)} s`;
  }

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(`pane-${tabName}`);
      if (pane) pane.classList.add('active');
    });
  });

  const reloadPrompt = document.getElementById('reload-prompt');
  const btnReloadNetflix = document.getElementById('btn-reload-netflix');
  if (btnReloadNetflix) {
    btnReloadNetflix.addEventListener('click', () => {
      if (activeTabId) {
        chrome.tabs.reload(activeTabId);
      }
    });
  }

  const STREAMING_DOMAINS = [
    'netflix.com',
    'primevideo.com',
    'amazon.',
    'crave.ca',
    'disneyplus.com',
    'max.com',
    'hbomax.com',
    'apple.com',
    'hulu.com',
    'youtube.com',
    'paramountplus.com',
    'peacocktv.com',
    'crunchyroll.com',
    'bilibili.com'
  ];

  function getPlatformInfo(url) {
    if (!url) return { name: 'Universal', badgeClass: '' };
    const u = url.toLowerCase();
    if (u.includes('netflix.com')) return { name: 'Netflix', badgeClass: 'platform-netflix' };
    if (u.includes('primevideo.com') || u.includes('amazon.')) return { name: 'Prime Video', badgeClass: 'platform-prime' };
    if (u.includes('crave.ca')) return { name: 'Crave', badgeClass: 'platform-crave' };
    if (u.includes('disneyplus.com')) return { name: 'Disney+', badgeClass: 'platform-disney' };
    if (u.includes('max.com') || u.includes('hbomax.com')) return { name: 'Max', badgeClass: 'platform-max' };
    if (u.includes('apple.com')) return { name: 'Apple TV+', badgeClass: 'platform-appletv' };
    if (u.includes('youtube.com')) return { name: 'YouTube', badgeClass: 'platform-youtube' };
    if (u.includes('hulu.com')) return { name: 'Hulu', badgeClass: 'platform-hulu' };
    if (u.includes('crunchyroll.com')) return { name: 'Crunchyroll', badgeClass: 'platform-crunchyroll' };
    if (u.includes('bilibili.com')) return { name: 'Bilibili', badgeClass: 'platform-bilibili' };
    return { name: 'Streaming', badgeClass: '' };
  }

  async function getActiveStreamingTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0] && tabs[0].url) {
        return tabs[0];
      }
      // Fallback: check any streaming tab
      for (const domain of STREAMING_DOMAINS) {
        const matching = await chrome.tabs.query({ url: `*://*.${domain}/*` });
        if (matching && matching.length > 0) {
          const active = matching.find(t => t.active) || matching[0];
          return active;
        }
      }
    } catch (e) {
      console.warn('Error querying active tab:', e);
    }
    return null;
  }

  let isInjecting = false;
  async function ensureContentScriptInjected(tabId) {
    if (isInjecting) return false;
    isInjecting = true;
    try {
      // 1. First probe if content script is already answering
      try {
        const ping = await chrome.tabs.sendMessage(tabId, { type: 'GET_STATE' });
        if (ping && ping.success) return true;
      } catch (e) {}

      // 2. Check if already initialized in tab
      try {
        const checkResult = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => Boolean(window.__NETFLIX_SUBTITLE_INITIALIZED__)
        });
        if (checkResult && checkResult[0] && checkResult[0].result) {
          return true;
        }
      } catch (e) {}

      console.log('[Popup] Attempting to auto-inject content script into tab', tabId);
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/content/page-bridge.js'],
          world: 'MAIN'
        });
      } catch (bridgeErr) {
        // page-bridge is specific to Netflix window.netflix, ignore on other sites
      }

      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          'src/storage/storage.js',
          'src/subtitle/srt-parser.js',
          'src/subtitle/vtt-parser.js',
          'src/subtitle/subtitle-engine.js',
          'src/subtitle/subtitle-ranking.js',
          'src/subtitle/subtitle-translator.js',
          'src/subtitle/native-calibrator.js',
          'src/content/netflix-detector.js',
          'src/content/video-controller.js',
          'src/content/subtitle-overlay.js',
          'src/content/content.js'
        ]
      });
      return true;
    } catch (err) {
      console.warn('[Popup] Auto-injection failed:', err);
      return false;
    } finally {
      isInjecting = false;
    }
  }

  async function refreshState() {
    const activeTab = await getActiveStreamingTab();
    activeTabId = activeTab ? activeTab.id : null;
    const activeTabUrl = activeTab ? activeTab.url : '';

    if (!activeTabId) {
      statusIndicator.classList.remove('connected');
      statusIndicator.querySelector('.status-text').textContent = 'No Streaming Tab';
      mediaTitleEl.textContent = '请打开流媒体播放页面';
      mediaBadgeEl.textContent = 'Offline';
      subStatusEl.textContent = '支持 Netflix, Prime, Crave, Disney+, Max, YouTube 等';
      btnTriggerAutoSearch.disabled = true;
      if (reloadPrompt) reloadPrompt.style.display = 'none';
      return;
    }

    const platInfo = getPlatformInfo(activeTabUrl);
    if (platformBadgeEl) {
      platformBadgeEl.textContent = platInfo.name;
      platformBadgeEl.className = `platform-badge ${platInfo.badgeClass}`.trim();
    }

    btnTriggerAutoSearch.disabled = false;

    try {
      const response = await chrome.tabs.sendMessage(activeTabId, { type: 'GET_STATE' });
      if (response && response.success) {
        statusIndicator.classList.add('connected');
        statusIndicator.querySelector('.status-text').textContent = 'Connected';
        if (reloadPrompt) reloadPrompt.style.display = 'none';

        detectedMedia = response.media;
        const currentVid = detectedMedia?.videoId || null;
        const isNewVideo = currentVid && currentVid !== lastDetectedVideoId;
        if (isNewVideo) {
          lastDetectedVideoId = currentVid;
        }

        const isJunkOrPlaceholder = !detectedMedia || !detectedMedia.title ||
          detectedMedia.title.includes('Video ') ||
          detectedMedia.title.toLowerCase() === 'flix' ||
          detectedMedia.title.toLowerCase() === 'netflix';

        if (detectedMedia && detectedMedia.title && !isJunkOrPlaceholder) {
          mediaTitleEl.textContent = detectedMedia.title;
          if (titleEditBox && !isUserEditingTitle && titleEditBox.style.display !== 'none' && !inputEditTitle.value) {
            titleEditBox.style.display = 'none';
          }

          if (detectedMedia.type === 'tv' && (detectedMedia.season || detectedMedia.episode)) {
            mediaBadgeEl.textContent = `S${detectedMedia.season || 1} • E${detectedMedia.episode || 1}`;
          } else {
            mediaBadgeEl.textContent = 'Movie';
          }
          if ((isNewVideo || !searchTitleInput.value) && document.activeElement !== searchTitleInput) {
            searchTitleInput.value = detectedMedia.title;
          }
        } else {
          const vid = detectedMedia?.videoId || '';
          mediaTitleEl.textContent = vid ? `视频 ID: ${vid}` : `${platInfo.name} Player`;
          mediaBadgeEl.textContent = '待确认片名';
          if (isNewVideo && document.activeElement !== searchTitleInput) {
            searchTitleInput.value = '';
          }
          if (titleEditBox && titleEditBox.style.display === 'none' && !isUserEditingTitle && !inputEditTitle.value) {
            titleEditBox.style.display = 'block';
            inputEditTitle.placeholder = '输入片名 (如: The Thicket / 三体)';
          }
        }

        if (response.engine && response.engine.hasSubtitles) {
          subStatusEl.textContent = `✓ 已自动装载 (${response.engine.cuesCount} 句)`;
          subStatusEl.style.color = 'var(--success-green)';
          btnTriggerAutoSearch.textContent = '✓ 字幕已自动装载 (点击重新匹配)';
          btnTriggerAutoSearch.classList.remove('btn-primary');
          btnTriggerAutoSearch.classList.add('btn-secondary');
        } else {
          subStatusEl.textContent = '尚未装载字幕 (就绪)';
          subStatusEl.style.color = 'var(--text-secondary)';
          btnTriggerAutoSearch.textContent = '⚡ 确认片名并自动加载字幕';
          btnTriggerAutoSearch.classList.remove('btn-secondary');
          btnTriggerAutoSearch.classList.add('btn-primary');
        }

        if (response.engine && response.engine.offset !== undefined) {
          updateOffsetDisplay(response.engine.offset);
        }

        if (response.video && response.video.hasVideo) {
          playbackTimeEl.textContent = `${formatSeconds(response.video.currentTime)} / ${formatSeconds(response.video.duration)}`;
        }

        if (response.calibrator && calibratorBadgeEl) {
          if (response.calibrator.enabled) {
            calibratorBadgeEl.textContent = '自动监控中';
            calibratorBadgeEl.style.color = '#00f2fe';
            calibratorBadgeEl.style.background = 'rgba(0, 242, 254, 0.15)';
          } else {
            calibratorBadgeEl.textContent = '已暂停';
            calibratorBadgeEl.style.color = 'var(--text-secondary)';
            calibratorBadgeEl.style.background = 'rgba(255, 255, 255, 0.1)';
          }
        }

        if (response.settings) {
          applySettingsToUi(response.settings);
        }
        return;
      }
    } catch (err) {
      // Content script not answering -> auto-inject
      const injected = await ensureContentScriptInjected(activeTabId);
      if (injected) {
        try {
          const retryResp = await chrome.tabs.sendMessage(activeTabId, { type: 'GET_STATE' });
          if (retryResp && retryResp.success) {
            statusIndicator.classList.add('connected');
            statusIndicator.querySelector('.status-text').textContent = 'Connected';
            if (reloadPrompt) reloadPrompt.style.display = 'none';
            return;
          }
        } catch (e2) {}
      }

      statusIndicator.classList.remove('connected');
      statusIndicator.querySelector('.status-text').textContent = '需要刷新页面';
      if (reloadPrompt) reloadPrompt.style.display = 'flex';
    }
  }

  // Title edit controls
  const btnEditTitle = document.getElementById('btn-edit-title');
  const titleEditBox = document.getElementById('title-edit-box');
  const inputEditTitle = document.getElementById('input-edit-title');
  const btnConfirmTitle = document.getElementById('btn-confirm-title');

  let isUserEditingTitle = false;

  if (inputEditTitle) {
    inputEditTitle.addEventListener('focus', () => {
      isUserEditingTitle = true;
      setTimeout(() => inputEditTitle.select(), 50);
    });
    inputEditTitle.addEventListener('input', () => { isUserEditingTitle = true; });
  }

  if (btnEditTitle) {
    btnEditTitle.addEventListener('click', () => {
      const isHidden = titleEditBox.style.display === 'none';
      titleEditBox.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        isUserEditingTitle = true;
        if (detectedMedia && detectedMedia.title &&
            !detectedMedia.title.startsWith('Netflix Video') &&
            detectedMedia.title.toLowerCase() !== 'flix' &&
            detectedMedia.title.toLowerCase() !== 'netflix') {
          inputEditTitle.value = detectedMedia.title;
        } else {
          inputEditTitle.value = '';
        }
        inputEditTitle.focus();
        setTimeout(() => inputEditTitle.select(), 50);
      } else {
        isUserEditingTitle = false;
      }
    });
  }

  async function applyManualTitle(newTitle) {
    if (!newTitle || !newTitle.trim()) return;
    const clean = newTitle.trim();
    isUserEditingTitle = false;
    mediaTitleEl.textContent = clean;
    searchTitleInput.value = clean;
    if (titleEditBox) titleEditBox.style.display = 'none';

    if (btnConfirmTitle) {
      btnConfirmTitle.disabled = true;
      btnConfirmTitle.textContent = '🔍 正在检索并翻译...';
    }
    if (btnTriggerAutoSearch) {
      btnTriggerAutoSearch.disabled = true;
      btnTriggerAutoSearch.textContent = '🔍 正在检索并翻译...';
    }
    subStatusEl.textContent = `🔍 正在检索 ${clean} 的字幕...`;
    subStatusEl.style.color = '#00f2fe';

    if (activeTabId) {
      showToast(`正在自动检索并加载: ${clean}...`);
      try {
        const res = await chrome.tabs.sendMessage(activeTabId, {
          type: 'SET_MANUAL_TITLE',
          payload: { title: clean }
        });
        if (res && res.success) {
          showToast(`✓ 已自动装载 ${res.cuesCount || ''} 句字幕！`);
        } else if (res && res.error) {
          showToast(res.error);
        }
      } catch (e) {
        console.warn('SET_MANUAL_TITLE error:', e);
      }
      await refreshState();
      if (btnConfirmTitle) {
        btnConfirmTitle.disabled = false;
        btnConfirmTitle.textContent = '⚡ 确认并一键加载';
      }
    }
  }

  if (btnConfirmTitle) {
    btnConfirmTitle.addEventListener('click', () => {
      applyManualTitle(inputEditTitle.value);
    });
  }

  if (inputEditTitle) {
    inputEditTitle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        applyManualTitle(inputEditTitle.value);
      }
    });
  }

  // One-click Auto Search & Translation Trigger
  btnTriggerAutoSearch.addEventListener('click', async () => {
    if (!activeTabId) {
      showToast('未检测到流媒体播放页面');
      return;
    }

    // Truly one-click: If user entered or corrected a title in the input box, apply it directly!
    const manualVal = inputEditTitle ? inputEditTitle.value.trim() : '';
    const currentTitle = detectedMedia?.title || '';
    const isCurrentJunk = !currentTitle || currentTitle.includes('Video ') || currentTitle.toLowerCase() === 'flix' || currentTitle.toLowerCase() === 'netflix';

    if (manualVal && (isCurrentJunk || manualVal !== currentTitle)) {
      await applyManualTitle(manualVal);
      return;
    }

    btnTriggerAutoSearch.disabled = true;
    btnTriggerAutoSearch.textContent = '🔍 正在检索并翻译 (约需 3-4 秒)...';
    subStatusEl.textContent = '🔍 正在检索公开字幕库并自动生成中英双语...';
    subStatusEl.style.color = '#00f2fe';

    try {
      const response = await chrome.tabs.sendMessage(activeTabId, { type: 'TRIGGER_AUTO_SEARCH' });
      if (response && response.success) {
        showToast(`✓ 已自动装载 ${response.cuesCount} 句字幕！`);
        await refreshState();
      } else {
        const errorMsg = response?.error || '未检索到匹配字幕，请点击【搜索】手动查找';
        showToast(errorMsg);
        subStatusEl.textContent = `⚠️ ${errorMsg}`;
        subStatusEl.style.color = 'var(--accent-red)';
        btnTriggerAutoSearch.disabled = false;
        btnTriggerAutoSearch.textContent = '⚡ 确认片名并自动加载字幕';
        await refreshState();
      }
    } catch (e) {
      console.error('[Popup] Trigger auto search error:', e);
      showToast('无法与播放页通信，请刷新播放页后重试');
      btnTriggerAutoSearch.disabled = false;
      btnTriggerAutoSearch.textContent = '⚡ 确认片名并自动加载字幕';
      await refreshState();
    }
  });

  async function loadSubtitleContent(content, filename) {
    if (!activeTabId) {
      showToast('Error: No active Netflix player tab found.');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(activeTabId, {
        type: 'LOAD_SUBTITLES',
        payload: {
          content,
          filename,
          format: filename.endsWith('.vtt') ? 'vtt' : 'srt'
        }
      });

      if (response && response.success) {
        showToast(`已加载 ${response.cuesCount} 句字幕!`);
        subStatusEl.textContent = `✓ 已加载: ${filename}`;
        subStatusEl.style.color = 'var(--success-green)';
      } else {
        showToast(response?.error || '解析字幕失败');
      }
    } catch (err) {
      console.error(err);
      showToast('无法与 Netflix 播放页通信');
    }
  }

  btnBrowseFile.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      loadSubtitleContent(event.target.result, file.name);
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        loadSubtitleContent(event.target.result, file.name);
      };
      reader.readAsText(file);
    }
  });

  btnClearSubtitle.addEventListener('click', async () => {
    if (!activeTabId) return;
    try {
      await chrome.tabs.sendMessage(activeTabId, { type: 'CLEAR_SUBTITLES' });
    } catch (e) {}
    subStatusEl.textContent = '尚未加载字幕';
    subStatusEl.style.color = 'var(--text-secondary)';
    showToast('字幕已清空');
  });

  // Offset Controls
  async function adjustOffset(delta) {
    if (!activeTabId) return;
    try {
      const response = await chrome.tabs.sendMessage(activeTabId, {
        type: 'SET_OFFSET',
        payload: { delta }
      });
      if (response && response.success) {
        updateOffsetDisplay(response.offset);
      }
    } catch (e) {}
  }

  async function resetOffset() {
    if (!activeTabId) return;
    try {
      const response = await chrome.tabs.sendMessage(activeTabId, {
        type: 'SET_OFFSET',
        payload: { offset: 0.0 }
      });
      if (response && response.success) {
        updateOffsetDisplay(0.0);
      }
    } catch (e) {}
  }

  btnStepMinus1.addEventListener('click', () => adjustOffset(-1.0));
  btnStepMinus01.addEventListener('click', () => adjustOffset(-0.1));
  btnStepReset.addEventListener('click', () => resetOffset());
  btnStepPlus01.addEventListener('click', () => adjustOffset(0.1));
  btnStepPlus1.addEventListener('click', () => adjustOffset(1.0));

  // External Subtitle Links
  const extLinkButtons = document.querySelectorAll('.ext-link-btn');
  extLinkButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const site = btn.getAttribute('data-site');
      let query = (searchTitleInput.value || (detectedMedia && detectedMedia.title) || '').trim();
      if (query.startsWith('Netflix Video')) query = '';

      const term = query || 'The Thicket';
      const encoded = encodeURIComponent(term);
      let targetUrl = '';

      switch (site) {
        case 'zimuku':
          targetUrl = `https://zimuku.org/search?q=${encoded}`;
          break;
        case 'subhd':
          targetUrl = `https://subhd.tv/search/${encoded}`;
          break;
        case 'assrt':
          targetUrl = `https://assrt.net/sub/?searchword=${encoded}`;
          break;
        case 'subdl':
          targetUrl = `https://subdl.com/search/${encoded}`;
          break;
        case 'yts':
          targetUrl = `https://yts-subs.com/search/${encoded}`;
          break;
      }

      if (targetUrl) {
        chrome.tabs.create({ url: targetUrl });
      }
    });
  });

  // Search
  btnSearchSubdl.addEventListener('click', async () => {
    const title = searchTitleInput.value.trim();
    if (!title) {
      showToast('请输入要搜索的片名');
      return;
    }

    const lang = searchLangSelect.value;
    btnSearchSubdl.disabled = true;
    btnSearchSubdl.textContent = 'Searching...';
    searchEmptyState.textContent = 'Searching online subtitles...';
    searchEmptyState.style.display = 'flex';
    searchResultsList.style.display = 'none';

    try {
      const media = detectedMedia || { title, type: 'movie' };
      media.title = title;

      const response = await chrome.runtime.sendMessage({
        type: 'SUBDL_SEARCH',
        payload: { media, language: lang }
      });

      if (!response || !response.success) {
        searchEmptyState.textContent = response?.error || 'No subtitles found.';
        return;
      }

      const results = response.results || [];
      if (results.length === 0) {
        searchEmptyState.innerHTML = `
          <div style="text-align: center; padding: 12px 6px;">
            <div style="font-size: 20px; margin-bottom: 6px;">🔍</div>
            <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">未直接匹配到公开字幕</div>
            <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 10px;">
              可点击下方【字幕库 / SubHD / 伪射手】快速下载 .srt 文件，然后拖入【Manual File】即可秒播。
            </div>
          </div>
        `;
        return;
      }

      searchEmptyState.style.display = 'none';
      searchResultsList.style.display = 'block';
      searchResultsList.innerHTML = '';

      if (response.fallbackToEnglish) {
        const banner = document.createElement('div');
        banner.style.cssText = 'background: rgba(229, 9, 20, 0.15); border: 1px solid rgba(229, 9, 20, 0.4); padding: 8px; border-radius: 6px; margin-bottom: 10px; font-size: 11px; line-height: 1.4; color: #ffb4b4;';
        banner.innerHTML = `💡 该影片暂无原生中文字幕。已为您检索到 <strong>${results.length}</strong> 个高质量英文字幕，点击 <strong>【⚡ 翻译并加载】</strong> 即可秒变中英双语字幕！`;
        searchResultsList.appendChild(banner);
      }

      results.forEach(item => {
        const isEnglish = (item.language || '').toLowerCase().includes('en');
        const isChineseSearch = lang.startsWith('zh');

        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
          <div class="result-title" title="${item.release_name || item.title}">${item.release_name || item.title}</div>
          <div class="result-meta">
            <span>${item.language} • ${item.source}</span>
            <span class="result-score">${item.matchScore > 0 ? `★ ${item.matchScore} pts` : ''}</span>
          </div>
          <div class="result-actions" style="display: flex; gap: 6px; margin-top: 6px;">
            ${(isEnglish && isChineseSearch) ? `<button class="btn btn-primary btn-sm btn-load-translate" style="flex: 1;">⚡ 翻译并加载</button>` : ''}
            <button class="btn ${!(isEnglish && isChineseSearch) ? 'btn-primary' : 'btn-outline'} btn-sm btn-load-remote" style="flex: 1;">${(isEnglish && isChineseSearch) ? '原字幕' : '加载字幕'}</button>
          </div>
        `;

        const loadRemoteBtn = div.querySelector('.btn-load-remote');
        loadRemoteBtn.addEventListener('click', async () => {
          loadRemoteBtn.disabled = true;
          loadRemoteBtn.textContent = 'Downloading...';
          try {
            const dlResp = await chrome.runtime.sendMessage({
              type: 'SUBDL_DOWNLOAD',
              payload: { result: item, translate: false }
            });

            if (dlResp && dlResp.success) {
              await loadSubtitleContent(dlResp.content, dlResp.filename);
              loadRemoteBtn.textContent = '✓ 已加载';
            } else {
              showToast(dlResp?.error || 'Download failed');
              loadRemoteBtn.textContent = '加载字幕';
              loadRemoteBtn.disabled = false;
            }
          } catch (e) {
            showToast('Download failed');
            loadRemoteBtn.textContent = '加载字幕';
            loadRemoteBtn.disabled = false;
          }
        });

        const loadTranslateBtn = div.querySelector('.btn-load-translate');
        if (loadTranslateBtn) {
          loadTranslateBtn.addEventListener('click', async () => {
            loadTranslateBtn.disabled = true;
            loadTranslateBtn.textContent = '翻译中...';
            try {
              const dlResp = await chrome.runtime.sendMessage({
                type: 'SUBDL_DOWNLOAD',
                payload: { result: item, translate: true, targetLang: lang }
              });

              if (dlResp && dlResp.success) {
                await loadSubtitleContent(dlResp.content, dlResp.filename);
                loadTranslateBtn.textContent = '✓ 已翻译加载';
              } else {
                showToast(dlResp?.error || 'Translation failed');
                loadTranslateBtn.textContent = '⚡ 翻译并加载';
                loadTranslateBtn.disabled = false;
              }
            } catch (e) {
              showToast('Translation failed');
              loadTranslateBtn.textContent = '⚡ 翻译并加载';
              loadTranslateBtn.disabled = false;
            }
          });
        }

        searchResultsList.appendChild(div);
      });
    } catch (err) {
      console.error(err);
      searchEmptyState.textContent = 'Error during search.';
    } finally {
      btnSearchSubdl.disabled = false;
      btnSearchSubdl.textContent = 'Search';
    }
  });

  // -------------------------------------------------------------
  // Live Style Preview & Real-Time Setting Synchronization
  // -------------------------------------------------------------
  function updatePreview(settings) {
    if (!previewSubBox || !settings) return;

    // 1. Font size
    const fontSize = settings.fontSize || 28;
    if (valFontSize) valFontSize.textContent = `${fontSize} px`;
    if (sliderFontSize && parseInt(sliderFontSize.value, 10) !== fontSize) {
      sliderFontSize.value = fontSize;
    }
    if (previewPrimary) previewPrimary.style.fontSize = `${fontSize}px`;
    if (previewSecondary) previewSecondary.style.fontSize = `${Math.round(fontSize * 0.78)}px`;

    // 2. Bottom offset
    const bottomOffset = settings.bottomOffset !== undefined ? settings.bottomOffset : 8;
    if (valBottomOffset) valBottomOffset.textContent = `${bottomOffset} %`;
    if (sliderBottomOffset && parseInt(sliderBottomOffset.value, 10) !== bottomOffset) {
      sliderBottomOffset.value = bottomOffset;
    }

    // 3. Position preview inside stage
    if (previewStage) {
      const pos = settings.position || 'bottom';
      previewStage.style.justifyContent = pos === 'top' ? 'flex-start' : (pos === 'middle' ? 'center' : 'flex-end');
      previewStage.style.paddingBottom = pos === 'bottom' ? `${Math.min(22, bottomOffset * 1.2)}px` : '0';
      previewStage.style.paddingTop = pos === 'top' ? `${Math.min(22, bottomOffset * 1.2)}px` : '0';
    }

    // 4. Text Color
    const color = settings.textColor || '#ffffff';
    if (previewPrimary) previewPrimary.style.color = color;
    if (previewSecondary) {
      previewSecondary.style.color = (color === '#ffffff') ? 'rgba(255, 255, 255, 0.85)' : color;
    }

    // 5. Font Family
    let family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
    if (settings.fontFamily === 'serif') {
      family = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, Georgia, serif';
    } else if (settings.fontFamily === 'rounded') {
      family = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Comic Sans MS", cursive, sans-serif';
    } else if (settings.fontFamily === 'monospace') {
      family = 'Consolas, "Courier New", monospace';
    }
    previewSubBox.style.fontFamily = family;

    // 6. Style Preset
    previewSubBox.className = 'preview-sub-box';
    const preset = settings.stylePreset || 'pill';
    previewSubBox.classList.add(`preset-${preset}`);

    // 7. Display Mode (Bilingual Chinese-English default)
    const mode = settings.displayMode || 'bilingual_zh_en';
    if (previewModeIndicator) {
      if (mode === 'bilingual_zh_en') previewModeIndicator.textContent = '中英双语 (中上英下)';
      else if (mode === 'target_only') previewModeIndicator.textContent = '仅中文字幕';
      else if (mode === 'bilingual_en_zh') previewModeIndicator.textContent = '英中双语 (英上中下)';
    }

    if (previewPrimary && previewSecondary) {
      if (mode === 'bilingual_zh_en') {
        previewPrimary.textContent = '你好，警长在哪里？';
        previewSecondary.textContent = 'Hello, where is the sheriff?';
        previewSecondary.style.display = 'block';
      } else if (mode === 'target_only') {
        previewPrimary.textContent = '你好，警长在哪里？';
        previewSecondary.style.display = 'none';
      } else if (mode === 'bilingual_en_zh') {
        previewPrimary.textContent = 'Hello, where is the sheriff?';
        previewSecondary.textContent = '你好，警长在哪里？';
        previewSecondary.style.display = 'block';
      }
    }
  }

  function applySettingsToUi(settings) {
    if (!settings) return;

    const isEnabled = settings.enabled !== false;
    if (masterPowerToggle) masterPowerToggle.checked = isEnabled;
    if (settingMasterEnabled) settingMasterEnabled.checked = isEnabled;
    if (masterPowerText) masterPowerText.textContent = isEnabled ? '已开启' : '已关闭';
    if (masterPowerWrap) masterPowerWrap.classList.toggle('disabled', !isEnabled);
    if (disabledBanner) disabledBanner.style.display = isEnabled ? 'none' : 'flex';

    if (checkAutoSearch) checkAutoSearch.checked = settings.autoSearch !== false;

    displayModeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-val') === (settings.displayMode || 'bilingual_zh_en'));
    });

    if (sliderFontSize && document.activeElement !== sliderFontSize) {
      sliderFontSize.value = settings.fontSize || 28;
      if (valFontSize) valFontSize.textContent = `${settings.fontSize || 28} px`;
    }

    if (sliderBottomOffset && document.activeElement !== sliderBottomOffset) {
      sliderBottomOffset.value = settings.bottomOffset !== undefined ? settings.bottomOffset : 8;
      if (valBottomOffset) valBottomOffset.textContent = `${sliderBottomOffset.value} %`;
    }

    positionButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-val') === (settings.position || 'bottom'));
    });

    colorButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-color') === (settings.textColor || '#ffffff'));
    });

    presetButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-val') === (settings.stylePreset || 'pill'));
    });

    if (selectFontFamily) {
      selectFontFamily.value = settings.fontFamily || 'sans-serif';
    }

    if (checkShowBackground) checkShowBackground.checked = !!settings.showBackground;
    if (checkRemember) checkRemember.checked = !!settings.rememberSubtitle;
    if (checkAutoCalibrateNative) checkAutoCalibrateNative.checked = settings.autoCalibrateNative !== false;
    if (selectTargetLanguage) selectTargetLanguage.value = settings.targetLanguage || settings.primaryLanguage || 'zh-CN';
    if (inputSubdlKey && settings.subdlApiKey) inputSubdlKey.value = settings.subdlApiKey;
    if (inputOpensubtitlesKey && settings.openSubtitlesApiKey) inputOpensubtitlesKey.value = settings.openSubtitlesApiKey;

    updatePreview(settings);
  }

  async function updateSetting(partial) {
    const updated = await StorageAdapter.saveSettings(partial);
    updatePreview(updated);
    if (activeTabId) {
      try {
        await chrome.tabs.sendMessage(activeTabId, {
          type: 'UPDATE_SETTINGS',
          payload: updated
        });
      } catch (e) {}
    }
  }

  // Master Power Switch Listeners
  async function handleToggleEnabled(enabled) {
    if (masterPowerToggle) masterPowerToggle.checked = enabled;
    if (settingMasterEnabled) settingMasterEnabled.checked = enabled;
    if (masterPowerText) masterPowerText.textContent = enabled ? '已开启' : '已关闭';
    if (masterPowerWrap) masterPowerWrap.classList.toggle('disabled', !enabled);
    if (disabledBanner) disabledBanner.style.display = enabled ? 'none' : 'flex';

    await updateSetting({ enabled });
    showToast(enabled ? '✓ 字幕插件已开启' : '已关闭字幕插件');
  }

  if (masterPowerToggle) {
    masterPowerToggle.addEventListener('change', (e) => {
      handleToggleEnabled(e.target.checked);
    });
  }
  if (settingMasterEnabled) {
    settingMasterEnabled.addEventListener('change', (e) => {
      handleToggleEnabled(e.target.checked);
    });
  }

  // Event Listeners for Appearance & Settings Controls
  if (sliderFontSize) {
    sliderFontSize.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (valFontSize) valFontSize.textContent = `${val} px`;
      updateSetting({ fontSize: val });
    });
  }

  if (sliderBottomOffset) {
    sliderBottomOffset.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (valBottomOffset) valBottomOffset.textContent = `${val} %`;
      updateSetting({ bottomOffset: val });
    });
  }

  displayModeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val');
      displayModeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateSetting({ displayMode: val });
    });
  });

  positionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val');
      positionButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateSetting({ position: val });
    });
  });

  colorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.getAttribute('data-color');
      colorButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateSetting({ textColor: color });
    });
  });

  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-val');
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateSetting({ stylePreset: preset });
    });
  });

  if (selectFontFamily) {
    selectFontFamily.addEventListener('change', () => {
      updateSetting({ fontFamily: selectFontFamily.value });
    });
  }

  if (checkShowBackground) {
    checkShowBackground.addEventListener('change', () => {
      updateSetting({ showBackground: checkShowBackground.checked });
    });
  }

  if (checkRemember) {
    checkRemember.addEventListener('change', () => {
      updateSetting({ rememberSubtitle: checkRemember.checked });
    });
  }

  if (checkAutoCalibrateNative) {
    checkAutoCalibrateNative.addEventListener('change', () => {
      updateSetting({ autoCalibrateNative: checkAutoCalibrateNative.checked });
    });
  }

  if (btnCalibrateNative) {
    btnCalibrateNative.addEventListener('click', async () => {
      if (!activeTabId) {
        showToast('未检测到视频播放页面');
        return;
      }

      btnCalibrateNative.disabled = true;
      btnCalibrateNative.textContent = '⏳ 正在检测播放器原生字幕...';
      if (calibrationResultEl) {
        calibrationResultEl.style.display = 'block';
        calibrationResultEl.style.background = 'rgba(255, 255, 255, 0.08)';
        calibrationResultEl.style.color = '#fff';
        calibrationResultEl.textContent = '正在从视频播放器提取当前字幕句段并对齐外挂时间轴...';
      }

      try {
        const resp = await chrome.tabs.sendMessage(activeTabId, { type: 'CALIBRATE_FROM_NATIVE' });
        if (resp && resp.success) {
          const sign = resp.delta >= 0 ? '+' : '';
          updateOffsetDisplay(resp.newOffset);
          if (calibrationResultEl) {
            calibrationResultEl.style.display = 'block';
            calibrationResultEl.style.background = 'rgba(34, 197, 94, 0.15)';
            calibrationResultEl.style.color = '#4ade80';
            const matchedSnippet = resp.matchedText ? `「${resp.matchedText.replace(/\n/g, ' ')}」` : '';
            calibrationResultEl.innerHTML = `✓ 校准成功！${matchedSnippet}<br>偏移已更新: ${sign}${resp.delta.toFixed(1)}s (当前总偏移: ${resp.newOffset >= 0 ? '+' : ''}${resp.newOffset.toFixed(1)}s)`;
          }
          showToast(`✓ 时间轴已校准: ${sign}${resp.delta.toFixed(1)}s`);
        } else {
          if (calibrationResultEl) {
            calibrationResultEl.style.display = 'block';
            if (resp && resp.hasNativeText) {
              calibrationResultEl.style.background = 'rgba(234, 179, 8, 0.15)';
              calibrationResultEl.style.color = '#fde047';
              calibrationResultEl.innerHTML = `⚠️ ${resp.message}`;
            } else {
              calibrationResultEl.style.background = 'rgba(229, 9, 20, 0.15)';
              calibrationResultEl.style.color = '#ff8080';
              calibrationResultEl.textContent = resp?.message || '未能捕获到原生字幕。请确保播放器内置字幕处于开启状态（如开启英文字幕），并在有对白出现时点击。';
            }
          }
        }
      } catch (err) {
        if (calibrationResultEl) {
          calibrationResultEl.style.display = 'block';
          calibrationResultEl.style.background = 'rgba(229, 9, 20, 0.15)';
          calibrationResultEl.style.color = '#ff8080';
          calibrationResultEl.textContent = `校准失败: ${err.message}`;
        }
      } finally {
        btnCalibrateNative.disabled = false;
        btnCalibrateNative.textContent = '🎯 捕获当前自带字幕并校准时间轴';
      }
    });
  }

  if (selectTargetLanguage) {
    selectTargetLanguage.addEventListener('change', async () => {
      const val = selectTargetLanguage.value;
      await updateSetting({ targetLanguage: val, primaryLanguage: val });
      const selectedText = selectTargetLanguage.options[selectTargetLanguage.selectedIndex]?.text || val;
      showToast(`目标语言已设为: ${selectedText.split(' ')[0]}`);
    });
  }

  btnSaveApiKey.addEventListener('click', async () => {
    const subdlKey = inputSubdlKey ? inputSubdlKey.value.trim() : '';
    const openSubKey = inputOpensubtitlesKey ? inputOpensubtitlesKey.value.trim() : '';

    btnSaveApiKey.disabled = true;
    btnSaveApiKey.textContent = '⏳ 正在验证 API 连通性...';
    if (apiTestStatusEl) {
      apiTestStatusEl.style.display = 'block';
      apiTestStatusEl.style.background = 'rgba(255, 255, 255, 0.08)';
      apiTestStatusEl.style.color = '#fff';
      apiTestStatusEl.textContent = '正在连接字幕服务服务器...';
    }

    const messages = [];
    let hasError = false;

    // Test SubDL Key if entered
    if (subdlKey) {
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'TEST_API_KEY',
          payload: { provider: 'subdl', apiKey: subdlKey }
        });
        if (res && res.success) {
          messages.push('✓ SubDL Key 验证通过！');
        } else {
          hasError = true;
          messages.push(`❌ SubDL 报错: ${res?.error || '连接失败'}`);
        }
      } catch (e) {
        messages.push(`❌ SubDL 测试失败: ${e.message}`);
      }
    }

    // Test OpenSubtitles Key if entered
    if (openSubKey) {
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'TEST_API_KEY',
          payload: { provider: 'opensubtitles', apiKey: openSubKey }
        });
        if (res && res.success) {
          messages.push('✓ OpenSubtitles Key 验证通过！');
        } else {
          hasError = true;
          messages.push(`❌ OpenSubtitles 报错: ${res?.error || '连接失败'}`);
        }
      } catch (e) {
        messages.push(`❌ OpenSubtitles 测试失败: ${e.message}`);
      }
    }

    await updateSetting({
      subdlApiKey: subdlKey,
      openSubtitlesApiKey: openSubKey
    });

    btnSaveApiKey.disabled = false;
    btnSaveApiKey.textContent = '🔍 测试并保存 API Key';

    if (apiTestStatusEl) {
      if (messages.length > 0) {
        apiTestStatusEl.style.display = 'block';
        apiTestStatusEl.style.background = hasError ? 'rgba(229, 9, 20, 0.2)' : 'rgba(34, 197, 94, 0.2)';
        apiTestStatusEl.style.color = hasError ? '#ff8080' : '#4ade80';
        apiTestStatusEl.innerHTML = messages.join('<br>');
      } else {
        apiTestStatusEl.style.display = 'block';
        apiTestStatusEl.style.background = 'rgba(255, 255, 255, 0.05)';
        apiTestStatusEl.style.color = 'var(--text-secondary)';
        apiTestStatusEl.textContent = '未输入 API Key。插件将使用免费公共字幕库。';
      }
    }

    showToast('设置已保存！');
  });

  const initialSettings = await StorageAdapter.getSettings();
  applySettingsToUi(initialSettings);
  await refreshState();

  setInterval(refreshState, 1500);
});
