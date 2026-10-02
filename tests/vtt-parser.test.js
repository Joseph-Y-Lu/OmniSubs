const test = require('node:test');
const assert = require('node:assert');
const { VttParser } = require('../src/subtitle/vtt-parser.js');

test('VttParser parses standard WebVTT format', () => {
  const sampleVtt = `WEBVTT

1
00:00:12.400 --> 00:00:15.200
Hello from WebVTT.

2
00:16.500 --> 00:19.000 line:0% align:start
Second cue with cue settings.
`;

  const cues = VttParser.parse(sampleVtt);
  assert.strictEqual(cues.length, 2);

  assert.strictEqual(cues[0].start, 12.4);
  assert.strictEqual(cues[0].end, 15.2);
  assert.strictEqual(cues[0].text, 'Hello from WebVTT.');

  assert.strictEqual(cues[1].start, 16.5);
  assert.strictEqual(cues[1].end, 19.0);
  assert.strictEqual(cues[1].text, 'Second cue with cue settings.');
});

test('VttParser cleans WebVTT voice and cue tags', () => {
  const vttTags = `WEBVTT

00:01:00.000 --> 00:01:04.000
<v Narrator>Once upon a time in a <c.yellow>faraway</c> land.</v>
`;

  const cues = VttParser.parse(vttTags);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].text, 'Once upon a time in a faraway land.');
});

test('VttParser ignores NOTE comments', () => {
  const vttWithNotes = `WEBVTT

NOTE This is a commentary note that should be skipped

00:00:01.000 --> 00:00:03.000
First actual subtitle.
`;

  const cues = VttParser.parse(vttWithNotes);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].text, 'First actual subtitle.');
});
