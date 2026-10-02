const test = require('node:test');
const assert = require('node:assert');
const { SubtitleTranslator } = require('../src/subtitle/subtitle-translator.js');

test('SubtitleTranslator handles bilingual formatting correctly', async () => {
  const sampleCues = [
    { id: 1, start: 1.0, end: 3.5, text: 'Hello world' },
    { id: 2, start: 4.0, end: 6.0, text: 'Good morning' }
  ];

  // Mock translateText
  const originalTranslateText = SubtitleTranslator.translateText;
  SubtitleTranslator.translateText = async (combined) => {
    return '你好世界 ___XYZ___ 早上好';
  };

  try {
    const zhOnly = await SubtitleTranslator.translateCues(sampleCues, {
      targetLang: 'zh-CN',
      mode: 'target_only'
    });
    assert.strictEqual(zhOnly[0].text, '你好世界');
    assert.strictEqual(zhOnly[0].start, 1.0);
    assert.strictEqual(zhOnly[0].end, 3.5);
    assert.strictEqual(zhOnly[1].text, '早上好');

    const bilingual = await SubtitleTranslator.translateCues(sampleCues, {
      targetLang: 'zh-CN',
      mode: 'bilingual_zh_en'
    });
    assert.strictEqual(bilingual[0].text, '你好世界\nHello world');
    assert.strictEqual(bilingual[1].text, '早上好\nGood morning');
  } finally {
    SubtitleTranslator.translateText = originalTranslateText;
  }
});
