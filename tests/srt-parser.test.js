const test = require('node:test');
const assert = require('node:assert');
const { SrtParser } = require('../src/subtitle/srt-parser.js');

test('SrtParser parses standard SRT format correctly', () => {
  const sampleSrt = `1
00:00:12,400 --> 00:00:15,200
Hello world.

2
00:00:16,000 --> 00:00:18,500
This is a test.
Second line of subtitle.
`;

  const cues = SrtParser.parse(sampleSrt);
  assert.strictEqual(cues.length, 2);

  assert.strictEqual(cues[0].id, 1);
  assert.strictEqual(cues[0].start, 12.4);
  assert.strictEqual(cues[0].end, 15.2);
  assert.strictEqual(cues[0].text, 'Hello world.');

  assert.strictEqual(cues[1].id, 2);
  assert.strictEqual(cues[1].start, 16.0);
  assert.strictEqual(cues[1].end, 18.5);
  assert.strictEqual(cues[1].text, 'This is a test.\nSecond line of subtitle.');
});

test('SrtParser cleans HTML and style tags', () => {
  const srtWithTags = `1
00:01:05,100 --> 00:01:08,200
<i>Italicized</i> and <b>bold</b> text.
<font color="#ffff00">Yellow text</font>
`;

  const cues = SrtParser.parse(srtWithTags);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].text, 'Italicized and bold text.\nYellow text');
});

test('SrtParser handles dot timestamps and Windows CRLF', () => {
  const srtCrlf = "1\r\n00:00:05.500 --> 00:00:09.125\r\nCRLF formatted\r\n\r\n";
  const cues = SrtParser.parse(srtCrlf);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].start, 5.5);
  assert.strictEqual(cues[0].end, 9.125);
  assert.strictEqual(cues[0].text, 'CRLF formatted');
});

test('SrtParser handles empty or invalid inputs gracefully', () => {
  assert.deepStrictEqual(SrtParser.parse(''), []);
  assert.deepStrictEqual(SrtParser.parse(null), []);
  assert.deepStrictEqual(SrtParser.parse('random garbage without timestamps'), []);
});
