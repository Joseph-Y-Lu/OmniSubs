const test = require('node:test');
const assert = require('node:assert/strict');
const { NetflixMetadataAdapter, MediaDetector } = require('../src/content/netflix-detector.js');
const { SubtitleTranslator } = require('../src/subtitle/subtitle-translator.js');
const { ProviderManager } = require('../src/providers/provider-manager.js');

test('MediaDetector cleans multi-platform streaming titles and quality tags correctly', () => {
  // Prime Video
  assert.strictEqual(
    MediaDetector.cleanTitle('The Lord of the Rings: The Rings of Power [4K UHD] | Prime Video'),
    'The Lord of the Rings: The Rings of Power'
  );
  assert.strictEqual(
    MediaDetector.cleanTitle('Inception (4K UHD) [X-Ray] | Prime Video'),
    'Inception'
  );

  // Crave
  assert.strictEqual(
    MediaDetector.cleanTitle('House of the Dragon | Crave'),
    'House of the Dragon'
  );
  assert.strictEqual(
    MediaDetector.cleanTitle('Watch The Wire on Crave'),
    'The Wire'
  );

  // Disney+
  assert.strictEqual(
    MediaDetector.cleanTitle('Loki | Disney+'),
    'Loki'
  );

  // Max / HBO Max
  assert.strictEqual(
    MediaDetector.cleanTitle('Succession | HBO Max'),
    'Succession'
  );
  assert.strictEqual(
    MediaDetector.cleanTitle('The Last of Us | Max'),
    'The Last of Us'
  );

  // Apple TV+
  assert.strictEqual(
    MediaDetector.cleanTitle('Ted Lasso | Apple TV+'),
    'Ted Lasso'
  );

  // YouTube
  assert.strictEqual(
    MediaDetector.cleanTitle('Interstellar Official Soundtrack - YouTube'),
    'Interstellar Official Soundtrack'
  );
});

test('MediaDetector parseSeasonEpisode supports various international formats', () => {
  assert.deepStrictEqual(MediaDetector.parseSeasonEpisode('Season 2, Ep. 4'), { season: 2, episode: 4 });
  assert.deepStrictEqual(MediaDetector.parseSeasonEpisode('S03E08'), { season: 3, episode: 8 });
  assert.deepStrictEqual(MediaDetector.parseSeasonEpisode('第2季 第5集'), { season: 2, episode: 5 });
  assert.deepStrictEqual(MediaDetector.parseSeasonEpisode('Ep. 12'), { season: 1, episode: 12 });
});

test('SubtitleTranslator getLanguageName maps language codes to friendly names', () => {
  assert.strictEqual(SubtitleTranslator.getLanguageName('zh-CN'), '简体中文');
  assert.strictEqual(SubtitleTranslator.getLanguageName('zh-TW'), '繁体中文');
  assert.strictEqual(SubtitleTranslator.getLanguageName('en'), '英语');
  assert.strictEqual(SubtitleTranslator.getLanguageName('ja'), '日语');
  assert.strictEqual(SubtitleTranslator.getLanguageName('ko'), '韩语');
  assert.strictEqual(SubtitleTranslator.getLanguageName('es'), '西班牙语');
  assert.strictEqual(SubtitleTranslator.getLanguageName('fr'), '法语');
});

test('ProviderManager prioritizes direct target language subtitles over auto-translation', async () => {
  const pm = new ProviderManager({});

  // Mock publicSubs to return both Chinese and English candidates
  pm.publicSubs.search = async () => [
    {
      id: '/mock/chinese',
      provider: 'PublicSubs',
      title: 'Dune',
      release_name: 'Dune.2021.Chinese.Public',
      language: 'Chinese',
      lang: 'zh',
      source: 'Public'
    },
    {
      id: '/mock/english',
      provider: 'PublicSubs',
      title: 'Dune',
      release_name: 'Dune.2021.English.Public',
      language: 'English',
      lang: 'en',
      source: 'Public'
    }
  ];

  pm.publicSubs.download = async (c) => {
    if (c.language === 'Chinese') {
      return `1\n00:00:01,000 --> 00:00:03,000\n沙丘\n`;
    }
    return `1\n00:00:01,000 --> 00:00:03,000\nDune\n`;
  };

  const result = await pm.autoResolveSubtitles(
    { title: 'Dune', type: 'movie' },
    { targetLang: 'zh-CN', displayMode: 'bilingual_zh_en' }
  );

  // Directly loaded native Chinese subtitle with zero translation latency!
  assert.strictEqual(result.isTranslated, false);
  assert.strictEqual(result.sourceLanguage, 'zh-CN');
  assert.strictEqual(result.cues[0].text, '沙丘');
});

test('ProviderManager falls back to auto-translating original language when target language is missing', async () => {
  const pm = new ProviderManager({});

  // Mock: only Japanese anime subtitles available
  pm.publicSubs.search = async () => [
    {
      id: '/mock/japanese',
      provider: 'PublicSubs',
      title: 'Spirited Away',
      release_name: 'Spirited.Away.Japanese.Public',
      language: 'Japanese',
      lang: 'ja',
      source: 'Public'
    }
  ];

  pm.publicSubs.download = async () => `1\n00:00:01,000 --> 00:00:03,000\n千と千尋の神隠し\n`;

  // Mock translateText
  const orig = SubtitleTranslator.translateText;
  SubtitleTranslator.translateText = async () => '千与千寻';

  try {
    const result = await pm.autoResolveSubtitles(
      { title: 'Spirited Away', type: 'movie' },
      { targetLang: 'zh-CN', displayMode: 'bilingual_zh_en' }
    );

    assert.strictEqual(result.isTranslated, true);
    assert.strictEqual(result.targetLanguage, 'zh-CN');
    assert.match(result.cues[0].text, /千与千寻/);
    assert.match(result.cues[0].text, /千と千尋の神隠し/);
  } finally {
    SubtitleTranslator.translateText = orig;
  }
});
