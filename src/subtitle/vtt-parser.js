/**
 * VttParser - Parses WebVTT (.vtt) subtitle files into SubtitleCue[]
 */

class VttParser {
  /**
   * Parse timestamp string (HH:MM:SS.mmm or MM:SS.mmm) to seconds
   * @param {string} timeStr
   * @returns {number}
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
   * Clean WebVTT specific voice and styling tags
   * e.g. <v Speaker>, <c.yellow>, <00:12.000>, <lang en>
   * @param {string} text
   * @returns {string}
   */
  static cleanText(text) {
    if (!text) return '';
    return text
      .replace(/<v[^>]*>([^<]*)<\/v>/gi, '$1') // preserve voice content
      .replace(/<c[^>]*>([^<]*)<\/c>/gi, '$1') // preserve class content
      .replace(/<[^>]+>/g, '')                 // strip all remaining HTML/VTT tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  /**
   * Parse raw WebVTT text into SubtitleCue[]
   * @param {string} vttContent
   * @returns {Array<{id: number, start: number, end: number, text: string}>}
   */
  static parse(vttContent) {
    if (!vttContent || typeof vttContent !== 'string') {
      return [];
    }

    const content = vttContent.replace(/^\uFEFF/, '').trim();
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split(/\n{2,}/);
    const cues = [];
    let autoId = 1;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i].trim();
      if (!block) continue;

      // Skip WEBVTT header and NOTE blocks
      if (block.startsWith('WEBVTT') || block.startsWith('NOTE') || block.startsWith('STYLE')) {
        continue;
      }

      const lines = block.split('\n');
      let timeLineIdx = -1;
      let timeParts = null;

      for (let j = 0; j < lines.length; j++) {
        if (lines[j].includes('-->')) {
          timeLineIdx = j;
          timeParts = lines[j].split('-->');
          break;
        }
      }

      if (timeLineIdx === -1 || !timeParts || timeParts.length < 2) {
        continue;
      }

      const start = this.parseTimestamp(timeParts[0]);
      // Remove any WebVTT cue settings like 'line:0% align:start'
      const endPart = timeParts[1].trim().split(/\s+/)[0];
      const end = this.parseTimestamp(endPart);

      if (isNaN(start) || isNaN(end) || end < start) {
        continue;
      }

      let cueId = autoId;
      if (timeLineIdx > 0) {
        const customId = lines[0].trim();
        const parsedNum = parseInt(customId, 10);
        cueId = !isNaN(parsedNum) ? parsedNum : autoId;
      }

      const textLines = lines.slice(timeLineIdx + 1)
        .map(l => this.cleanText(l))
        .filter(l => l.length > 0);

      if (textLines.length === 0) continue;

      cues.push({
        id: cueId,
        start: Math.round(start * 1000) / 1000,
        end: Math.round(end * 1000) / 1000,
        text: textLines.join('\n')
      });

      autoId++;
    }

    cues.sort((a, b) => a.start - b.start);
    return cues;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VttParser };
}
if (typeof globalThis !== 'undefined') {
  globalThis.VttParser = VttParser;
}
