const test = require('node:test');
const assert = require('node:assert/strict');
const { NativeSubtitleCalibrator } = require('../src/subtitle/native-calibrator.js');
const { SubtitleEngine } = require('../src/subtitle/subtitle-engine.js');

test('NativeSubtitleCalibrator.normalizeText cleans annotations, music notes, and HTML tags', () => {
  assert.strictEqual(NativeSubtitleCalibrator.normalizeText(''), '');
  assert.strictEqual(
    NativeSubtitleCalibrator.normalizeText('♪ (upbeat jazz music playing) ♪'),
    ''
  );
  assert.strictEqual(
    NativeSubtitleCalibrator.normalizeText('<i>[JOHN]:</i> What are you doing here?'),
    'what are you doing here'
  );
  assert.strictEqual(
    NativeSubtitleCalibrator.normalizeText('Hello, world! (screaming in distance)'),
    'hello world'
  );
  assert.strictEqual(
    NativeSubtitleCalibrator.normalizeText('你好，世界！【掌声】'),
    '你好 世界'
  );
});

test('NativeSubtitleCalibrator.calculateSimilarity accurately scores matches', () => {
  // Exact match
  assert.strictEqual(
    NativeSubtitleCalibrator.calculateSimilarity('What are you doing here?', 'What are you doing here?'),
    1.0
  );

  // Substring containment match
  const scoreContain = NativeSubtitleCalibrator.calculateSimilarity(
    'Where is the sheriff?',
    'Hello, where is the sheriff right now?'
  );
  assert.ok(scoreContain >= 0.85, `Expected >= 0.85, got ${scoreContain}`);

  // Token overlap (Jaccard)
  const scoreOverlap = NativeSubtitleCalibrator.calculateSimilarity(
    'we must evacuate the city immediately',
    'we have to evacuate this city immediately'
  );
  assert.ok(scoreOverlap >= 0.5, `Expected >= 0.5, got ${scoreOverlap}`);

  // Disjoint text
  assert.strictEqual(
    NativeSubtitleCalibrator.calculateSimilarity('completely unrelated dialogue', 'something totally different'),
    0
  );
});

test('NativeSubtitleCalibrator.findMatchingCue matches cue.originalText on translated subtitles', () => {
  const engine = new SubtitleEngine();
  engine.loadCues([
    {
      id: 1,
      start: 50.0,
      end: 54.0,
      text: '你好，警长在哪里？',
      originalText: 'Hello, where is the sheriff?'
    },
    {
      id: 2,
      start: 120.0,
      end: 125.0,
      text: '我们必须立刻离开这里。',
      originalText: 'We need to get out of here now.'
    }
  ]);

  const calibrator = new NativeSubtitleCalibrator(engine, null, null);

  // Native caption extracted in English from Prime/Crave
  const match = calibrator.findMatchingCue('where is the sheriff', 52.0);
  assert.ok(match, 'Expected match to be found');
  assert.strictEqual(match.cue.id, 1);
  assert.ok(match.score >= 0.8, `Expected score >= 0.8, got ${match.score}`);
});

test('NativeSubtitleCalibrator auto-calibrates commercial ad breaks on Prime Video / Crave', () => {
  const engine = new SubtitleEngine();
  // External theatrical subtitle timing (no commercials)
  engine.loadCues([
    {
      id: 1,
      start: 60.0,
      end: 64.0,
      text: 'We found the secret entrance.',
      originalText: 'We found the secret entrance.'
    },
    {
      id: 2,
      start: 150.0,
      end: 155.0,
      text: 'Hurry, time is running out!',
      originalText: 'Hurry, time is running out!'
    }
  ]);

  // Initially at 0 offset
  assert.strictEqual(engine.getOffset(), 0.0);

  let calibratedEvent = null;
  const mockVideoCtrl = {
    getCurrentTime: () => 90.0 // A 30s ad was inserted before minute 1!
  };
  const mockOverlay = {
    showHud: () => {}
  };

  const calibrator = new NativeSubtitleCalibrator(engine, mockVideoCtrl, mockOverlay);
  calibrator.onCalibrated = (info) => {
    calibratedEvent = info;
  };

  // When speech occurs on Prime Video at video.currentTime = 90.0,
  // the platform displays native CC: "We found the secret entrance."
  calibrator.processSample('We found the secret entrance.', 90.0);

  // New offset should be: cue.start (60.0) - videoTime (90.0) = -30.0s
  assert.strictEqual(engine.getOffset(), -30.0);
  assert.ok(calibratedEvent, 'Expected onCalibrated callback to fire');
  assert.strictEqual(calibratedEvent.newOffset, -30.0);
  assert.strictEqual(calibratedEvent.delta, -30.0);

  // Verify that with the calibrated -30s offset, the video clock at 90s correctly resolves cue 1
  const effectiveTime = engine.getEffectiveTime(90.0);
  assert.strictEqual(effectiveTime, 60.0);
  const activeCues = engine.getActiveCues(90.0);
  assert.strictEqual(activeCues.length, 1);
  assert.strictEqual(activeCues[0].id, 1);
});

test('NativeSubtitleCalibrator.manualCalibrate handles missing captions and successful alignment', () => {
  const engine = new SubtitleEngine();
  engine.loadCues([
    {
      id: 1,
      start: 100.0,
      end: 105.0,
      text: 'I think we are being followed.',
      originalText: 'I think we are being followed.'
    }
  ]);

  const mockVideo = {
    currentTime: 145.0, // 45s ad break
    textTracks: [
      {
        activeCues: [{ text: 'I think we are being followed.' }]
      }
    ]
  };

  const mockVideoCtrl = {
    getCurrentTime: () => 145.0,
    videoElement: mockVideo
  };

  const calibrator = new NativeSubtitleCalibrator(engine, mockVideoCtrl, null);

  const res = calibrator.manualCalibrate();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.newOffset, -45.0);
  assert.strictEqual(res.delta, -45.0);
  assert.strictEqual(engine.getOffset(), -45.0);
});

test('NativeSubtitleCalibrator.isValidCaptionText strictly filters episode headers and UI controls', () => {
  // Episode headers (like Crave "S1 E1: The Hedge Knight") MUST be rejected
  assert.strictEqual(NativeSubtitleCalibrator.isValidCaptionText('S1 E1: The Hedge Knight'), false);
  assert.strictEqual(NativeSubtitleCalibrator.isValidCaptionText('S01E01 The Hedge Knight'), false);
  assert.strictEqual(NativeSubtitleCalibrator.isValidCaptionText('Season 1, Episode 1'), false);
  assert.strictEqual(NativeSubtitleCalibrator.isValidCaptionText('第1季 第1集'), false);
  assert.strictEqual(NativeSubtitleCalibrator.isValidCaptionText('play'), false);
  assert.strictEqual(NativeSubtitleCalibrator.isValidCaptionText('cc'), false);

  // Spoken dialogue MUST be accepted
  assert.strictEqual(NativeSubtitleCalibrator.isValidCaptionText('[sobbing] I wish you didn\'t die, ser.'), true);
  assert.strictEqual(NativeSubtitleCalibrator.isValidCaptionText('Hello, where is the sheriff?'), true);
  assert.strictEqual(NativeSubtitleCalibrator.isValidCaptionText('我们要离开这里'), true);
});

test('NativeSubtitleCalibrator extracts dialogue from textTracks and ignores Crave episode titles', () => {
  const engine = new SubtitleEngine();
  engine.loadCues([
    {
      id: 1,
      start: 72.0,
      end: 76.0,
      text: 'I wish you didn\'t die, ser.',
      originalText: 'I wish you didn\'t die, ser.'
    }
  ]);

  // Video with 18s ad break (currentTime = 90.0 instead of 72.0)
  const mockVideo = {
    currentTime: 90.0,
    textTracks: [
      {
        activeCues: [{ text: '[sobbing]\nI wish you didn\'t die, ser.' }]
      }
    ]
  };

  const mockVideoCtrl = {
    getCurrentTime: () => 90.0,
    videoElement: mockVideo
  };

  const calibrator = new NativeSubtitleCalibrator(engine, mockVideoCtrl, null);
  const res = calibrator.manualCalibrate();

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.newOffset, -18.0);
  assert.strictEqual(res.delta, -18.0);
  assert.strictEqual(engine.getOffset(), -18.0);
});

