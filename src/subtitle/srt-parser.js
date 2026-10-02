/**
 * SrtParser - Parses SubRip (.srt) subtitle files into SubtitleCue[]
 * 
 * SubtitleCue structure:
 * {
 *   id: number,
 *   start: number, // in seconds
 *   end: number,   // in seconds
 *   text: string   // sanitized subtitle text
 * }
 */

class SrtParser {
  /**
   * Parse timestamp string to seconds
   * Supports "00:01:23,456" or "00:01:23.456" or "01:23,456"
   * @param {string} timeStr
   * @returns {number} seconds
   */
  static parseTimestamp(timeStr) {
    if (!timeStr) return 0;
    const cleanStr = timeStr.trim().replace(',', '.');
    const parts = cleanStr.split(':');
    
    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (parts.length === 3) {
      hours = parseFloat(parts[0]) || 0;
      minutes = parseFloat(parts[1]) || 0;
      seconds = parseFloat(parts[2]) || 0;
    } else if (parts.length === 2) {
      minutes = parseFloat(parts[0]) || 0;
      seconds = parseFloat(parts[1]) || 0;
    } else if (parts.length === 1) {
      seconds = parseFloat(parts[0]) || 0;
    }

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Cleans text formatting tags while preserving text
   * Handles <i>, <b>, <u>, <font color="...">, {y:i}, etc.
   * @param {string} text
   * @returns {string}
   */
  static cleanText(text) {
    if (!text) return '';
    return text
      .replace(/<[^>]+>/g, '')         // remove HTML/XML tags
      .replace(/\{[^}]+\}/g, '')         // remove SSA/ASS style tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  /**
   * Parse raw SRT text into SubtitleCue[]
   * @param {string} srtContent
   * @returns {Array<{id: number, start: number, end: number, text: string}>}
   */
  static parse(srtContent) {
    if (!srtContent || typeof srtContent !== 'string') {
      return [];
    }

    // Strip BOM
    const content = srtContent.replace(/^\uFEFF/, '').trim();
    // Normalize newlines to \n
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Split into blocks separated by two or more newlines
    const blocks = normalized.split(/\n{2,}/);
    const cues = [];
    let autoId = 1;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i].trim();
      if (!block) continue;

      const lines = block.split('\n');
      if (lines.length < 2) continue;

      let timeLineIdx = -1;
      let timeMatch = null;

      // Look for line containing '-->'
      for (let j = 0; j < lines.length; j++) {
        if (lines[j].includes('-->')) {
          timeLineIdx = j;
          timeMatch = lines[j].split('-->');
          break;
        }
      }

      if (timeLineIdx === -1 || !timeMatch || timeMatch.length < 2) {
        continue;
      }

      const start = this.parseTimestamp(timeMatch[0]);
      const end = this.parseTimestamp(timeMatch[1].split(' ')[0] || timeMatch[1]);

      if (isNaN(start) || isNaN(end) || end < start) {
        continue;
      }

      // Extract cue ID if present before timeline
      let cueId = autoId;
      if (timeLineIdx > 0) {
        const potentialId = parseInt(lines[0].trim(), 10);
        if (!isNaN(potentialId)) {
          cueId = potentialId;
        }
      }

      // Text lines are everything after the timeline
      const textLines = lines.slice(timeLineIdx + 1)
        .map(line => this.cleanText(line))
        .filter(line => line.length > 0);

      if (textLines.length === 0) continue;

      cues.push({
        id: cueId,
        start: Math.round(start * 1000) / 1000,
        end: Math.round(end * 1000) / 1000,
        text: textLines.join('\n')
      });

      autoId++;
    }

    // Sort cues by start time
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SrtParser };
}
if (typeof globalThis !== 'undefined') {
  globalThis.SrtParser = SrtParser;
}
