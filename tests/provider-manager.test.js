const test = require('node:test');
const assert = require('node:assert/strict');
const { ProviderManager } = require('../src/providers/provider-manager.js');

test('ProviderManager fallback to English auto-translation when target language is unavailable', async () => {
  const pm = new ProviderManager({});

  // Mock publicSubs search to return only English candidate
  pm.publicSubs.search = async () => [
    {
      id: '/mock/english',
      provider: 'PublicSubs',
      title: 'Test Movie',
      release_name: 'Test.Movie.2024.English.Public',
      language: 'English',
      source: 'Public'
    }
  ];

  pm.publicSubs.download = async () => `1\n00:00:01,000 --> 00:00:03,000\nHello world\n`;

  const result = await pm.autoResolveSubtitles(
    { title: 'Test Movie', type: 'movie' },
    { targetLang: 'zh-CN', displayMode: 'bilingual_zh_en' }
  );

  assert.strictEqual(result.isTranslated, true);
  assert.strictEqual(result.cues.length, 1);
  assert.match(result.cues[0].text, /你好/i);
  assert.match(result.cues[0].text, /Hello world/i);
});

test('ProviderManager skips mislabeled Spanish candidate when searching for English', async () => {
  const pm = new ProviderManager({});

  // Mock candidates: first is mislabeled Spanish, second is real English
  pm.publicSubs.search = async () => [
    {
      id: '/mock/spanish_mislabeled',
      provider: 'PublicSubs',
      title: 'Knight Show',
      release_name: 'Knight.Show.S01E01.eng',
      language: 'English',
      source: 'Public'
    },
    {
      id: '/mock/real_english',
      provider: 'PublicSubs',
      title: 'Knight Show',
      release_name: 'Knight.Show.S01E01.real.eng',
      language: 'English',
      source: 'Public'
    }
  ];

  pm.publicSubs.download = async (candidate) => {
    if (candidate.id === '/mock/spanish_mislabeled') {
      return `1\n00:00:01,000 --> 00:00:03,000\nNo sé muy bien qué decir. Tendría que haber un caballero aquí.\n`;
    }
    return `1\n00:00:01,000 --> 00:00:03,000\nI wish you didn't die, ser.\n`;
  };

  const result = await pm.autoResolveSubtitles(
    { title: 'Knight Show', type: 'tv', season: 1, episode: 1 },
    { targetLang: 'zh-CN', displayMode: 'bilingual_zh_en' }
  );

  assert.strictEqual(result.isTranslated, true);
  assert.match(result.filename, /real\.eng/i);
  assert.match(result.cues[0].originalText, /I wish you didn't die, ser/i);
});
