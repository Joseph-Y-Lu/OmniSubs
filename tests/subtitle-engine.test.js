const test = require('node:test');
const assert = require('node:assert');
const { SubtitleEngine } = require('../src/subtitle/subtitle-engine.js');

test('SubtitleEngine accurately matches cues by master clock time', () => {
  const engine = new SubtitleEngine();
  const sampleCues = [
    { id: 1, start: 10.0, end: 15.0, text: 'First line' },
    { id: 2, start: 18.0, end: 22.0, text: 'Second line' },
    { id: 3, start: 25.0, end: 30.0, text: 'Third line' }
  ];

  engine.loadCues(sampleCues);

  // Before first cue
  assert.strictEqual(engine.getActiveText(5.0), '');

  // During first cue
  assert.strictEqual(engine.getActiveText(10.0), 'First line');
  assert.strictEqual(engine.getActiveText(12.5), 'First line');
  assert.strictEqual(engine.getActiveText(15.0), 'First line');

  // Gap between cues
  assert.strictEqual(engine.getActiveText(16.0), '');

  // During second cue
  assert.strictEqual(engine.getActiveText(20.0), 'Second line');

  // After last cue
  assert.strictEqual(engine.getActiveText(35.0), '');
});

test('SubtitleEngine respects offset synchronization', () => {
  const engine = new SubtitleEngine();
  const sampleCues = [
    { id: 1, start: 10.0, end: 15.0, text: 'Line with offset' }
  ];
  engine.loadCues(sampleCues);

  // With offset +2.0s, at video time 8.0s, effective time = 8.0 + 2.0 = 10.0s (cue active!)
  engine.setOffset(2.0);
  assert.strictEqual(engine.getOffset(), 2.0);
  assert.strictEqual(engine.getActiveText(8.0), 'Line with offset');
  assert.strictEqual(engine.getActiveText(10.0), 'Line with offset');
  assert.strictEqual(engine.getActiveText(14.0), ''); // 14 + 2 = 16 (past end)

  // Adjust offset by -1.0s -> new offset is +1.0s
  engine.adjustOffset(-1.0);
  assert.strictEqual(engine.getOffset(), 1.0);
  assert.strictEqual(engine.getActiveText(9.0), 'Line with offset'); // 9 + 1 = 10
});

test('SubtitleEngine notifies cue change listeners on text transition', () => {
  const engine = new SubtitleEngine();
  engine.loadCues([
    { id: 1, start: 1.0, end: 3.0, text: 'Greeting' },
    { id: 2, start: 4.0, end: 6.0, text: 'Farewell' }
  ]);

  const transitions = [];
  engine.onCueChange((text) => {
    transitions.push(text);
  });

  // Time 0.0 -> no text
  engine.update(0.0);
  // Time 1.5 -> 'Greeting'
  engine.update(1.5);
  // Time 2.0 -> still 'Greeting' (should not trigger redundant notify)
  engine.update(2.0);
  // Time 3.5 -> ''
  engine.update(3.5);
  // Time 5.0 -> 'Farewell'
  engine.update(5.0);

  assert.deepStrictEqual(transitions, ['', 'Greeting', '', 'Farewell']);
});
