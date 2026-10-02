const test = require('node:test');
const assert = require('node:assert');
const { SubtitleRanking } = require('../src/subtitle/subtitle-ranking.js');

test('SubtitleRanking prioritizes matching season, episode, language, and WEB-DL', () => {
  const media = {
    title: 'Stranger Things',
    type: 'tv',
    season: 2,
    episode: 4
  };

  const candidates = [
    {
      name: 'Stranger.Things.S01E01.HDTV.srt',
      season: 1,
      episode: 1,
      language: 'English'
    },
    {
      name: 'Stranger.Things.S02E04.WEBRip.Netflix.srt',
      season: 2,
      episode: 4,
      language: 'Chinese Simplified'
    },
    {
      name: 'Stranger.Things.S02E04.720p.HDTV.srt',
      season: 2,
      episode: 4,
      language: 'English'
    }
  ];

  const ranked = SubtitleRanking.rank(candidates, media, 'zh-CN');

  assert.strictEqual(ranked.length, 3);
  // Highest score should be the Chinese Simplified S02E04 WEBRip Netflix
  assert.strictEqual(ranked[0].name, 'Stranger.Things.S02E04.WEBRip.Netflix.srt');
  assert.ok(ranked[0].matchScore > ranked[1].matchScore);
  // Lowest score should be S01E01 because of season/episode mismatch
  assert.strictEqual(ranked[2].name, 'Stranger.Things.S01E01.HDTV.srt');
});

test('SubtitleRanking handles movie matching with year', () => {
  const media = {
    title: 'Inception',
    type: 'movie',
    year: 2010
  };

  const candidates = [
    {
      name: 'Inception.2010.1080p.BluRay.x264.srt',
      year: 2010,
      language: 'Chinese Simplified'
    },
    {
      name: 'Inception.1998.CAM.srt',
      year: 1998,
      language: 'English'
    }
  ];

  const ranked = SubtitleRanking.rank(candidates, media, 'zh-CN');
  assert.strictEqual(ranked[0].name, 'Inception.2010.1080p.BluRay.x264.srt');
  assert.ok(ranked[0].matchScore > ranked[1].matchScore);
});
