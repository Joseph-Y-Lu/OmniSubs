const test = require('node:test');
const assert = require('node:assert/strict');
const { NetflixMetadataAdapter } = require('../src/content/netflix-detector.js');
const { StorageAdapter } = require('../src/storage/storage.js');

test('NetflixMetadataAdapter.cleanTitle and isValidTitle prevent flix bug and clean titles', () => {
  assert.strictEqual(NetflixMetadataAdapter.cleanTitle('Netflix'), '');
  assert.strictEqual(NetflixMetadataAdapter.cleanTitle('flix'), '');
  assert.strictEqual(NetflixMetadataAdapter.cleanTitle('Watch The Thicket | Netflix'), 'The Thicket');
  assert.strictEqual(NetflixMetadataAdapter.cleanTitle('Netflix - 观看《The Thicket》'), 'The Thicket');
  assert.strictEqual(NetflixMetadataAdapter.cleanTitle('观看《三体》| Netflix'), '三体');
  assert.strictEqual(NetflixMetadataAdapter.cleanTitle('The Thicket'), 'The Thicket');

  assert.strictEqual(NetflixMetadataAdapter.isValidTitle('Netflix Video 81238159'), false);
  assert.strictEqual(NetflixMetadataAdapter.isValidTitle('Netflix'), false);
  assert.strictEqual(NetflixMetadataAdapter.isValidTitle('flix'), false);
  assert.strictEqual(NetflixMetadataAdapter.isValidTitle('FLIX'), false);
  assert.strictEqual(NetflixMetadataAdapter.isValidTitle('Watch TV Shows Online, Watch Movies Online'), false);
  assert.strictEqual(NetflixMetadataAdapter.isValidTitle('Netflix 台湾 - 在线观看电影和电视节目'), false);
  assert.strictEqual(NetflixMetadataAdapter.isValidTitle('Unlimited movies, TV shows, and more'), false);
  assert.strictEqual(NetflixMetadataAdapter.isValidTitle('Watch on Netflix'), false);
  assert.strictEqual(NetflixMetadataAdapter.isValidTitle(''), false);

  assert.strictEqual(NetflixMetadataAdapter.isValidTitle('The Thicket'), true);
  assert.strictEqual(NetflixMetadataAdapter.isValidTitle('Stranger Things'), true);
  assert.strictEqual(NetflixMetadataAdapter.isValidTitle('三体'), true);
  assert.strictEqual(NetflixMetadataAdapter.isValidTitle('Breaking Bad'), true);
});

test('StorageAdapter saves and retrieves cached titles per videoId', async () => {
  await StorageAdapter.saveCachedTitle('81238159', 'The Thicket');
  const retrieved = await StorageAdapter.getCachedTitle('81238159');
  assert.strictEqual(retrieved, 'The Thicket');

  // Should ignore raw video placeholder titles
  await StorageAdapter.saveCachedTitle('89999999', 'Netflix Video 89999999');
  const ignored = await StorageAdapter.getCachedTitle('89999999');
  assert.strictEqual(ignored, null);
});

test('StorageAdapter saves and retrieves cached subtitle cues', async () => {
  const cues = [
    { id: 1, start: 0.5, end: 2.0, text: '你好\nHello' }
  ];
  await StorageAdapter.saveEpisodeSubtitles('The Thicket', {
    cues,
    filename: 'The.Thicket.1080p.srt',
    offset: 0.2,
    isTranslated: true,
    videoId: '81238159'
  });

  // Correct videoId match
  const cached = await StorageAdapter.getEpisodeSubtitles('The Thicket', '81238159');
  assert.ok(cached);
  assert.strictEqual(cached.cues.length, 1);
  assert.strictEqual(cached.cues[0].text, '你好\nHello');
  assert.strictEqual(cached.offset, 0.2);

  // Different videoId (e.g. user changed movies) MUST be rejected and return null!
  const crossPolluted = await StorageAdapter.getEpisodeSubtitles('The Thicket', '99999999');
  assert.strictEqual(crossPolluted, null);
});

test('NetflixMetadataAdapter manual override is strictly scoped to videoId', async () => {
  const adapter = new NetflixMetadataAdapter();
  await adapter.setManualTitle('Custom Title For Movie 1', '11111111');
  assert.strictEqual(adapter.manualOverrideTitle, 'Custom Title For Movie 1');
  assert.strictEqual(adapter.manualOverrideVideoId, '11111111');
});

test('SubtitleOverlay renderText formats correctly according to displayMode', () => {
  const { SubtitleOverlay } = require('../src/content/subtitle-overlay.js');
  const overlay = new SubtitleOverlay();
  const parent = { classList: { add() {}, remove() {} } };
  overlay.textElement = {
    parentElement: parent,
    innerHTML: ''
  };

  // 1. target_only mode (monolingual Chinese)
  overlay.settings.displayMode = 'target_only';
  overlay.renderText('你好世界\nHello world', true);
  assert.match(overlay.textElement.innerHTML, /你好世界/);
  assert.doesNotMatch(overlay.textElement.innerHTML, /Hello world/);

  // 2. bilingual_zh_en mode (Chinese primary on top, English secondary on bottom)
  overlay.settings.displayMode = 'bilingual_zh_en';
  overlay.renderText('你好世界\nHello world', true);
  assert.match(overlay.textElement.innerHTML, /sub-primary.*你好世界/s);
  assert.match(overlay.textElement.innerHTML, /sub-secondary.*Hello world/s);

  // 3. bilingual_en_zh mode (English primary on top, Chinese secondary on bottom)
  overlay.settings.displayMode = 'bilingual_en_zh';
  overlay.renderText('你好世界\nHello world', true);
  assert.match(overlay.textElement.innerHTML, /sub-primary.*Hello world/s);
  assert.match(overlay.textElement.innerHTML, /sub-secondary.*你好世界/s);

  // 4. Master toggle: when disabled, textElement is empty and no subtitles are rendered
  overlay.settings.enabled = false;
  overlay.renderText('你好世界\nHello world', true);
  assert.strictEqual(overlay.textElement.innerHTML, '');
});

test('StorageAdapter DEFAULT_SETTINGS has enabled master switch set to true', () => {
  assert.strictEqual(StorageAdapter.DEFAULT_SETTINGS.enabled, true);
});

