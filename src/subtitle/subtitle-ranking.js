/**
 * SubtitleRanking - Scores and ranks subtitle search candidates
 * 
 * Scoring criteria:
 * + exact title match (+40)
 * + correct season (+30)
 * + correct episode (+30)
 * + target language match (+25)
 * + Netflix/WEB-DL release source (+15)
 * + matching year / runtime (+10)
 * - season/episode mismatch (-50)
 * - cam/telesync low quality (-30)
 */

class SubtitleRanking {
  /**
   * Normalizes strings for comparison (lowercased, removes punctuation)
   * @param {string} str
   * @returns {string}
   */
  static normalize(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Checks if language matches target or variants
   * @param {string} candidateLang
   * @param {string} targetLang
   * @returns {boolean}
   */
  static isLanguageMatch(candidateLang, targetLang) {
    if (!candidateLang || !targetLang) return false;
    const c = candidateLang.toLowerCase().trim();
    const t = targetLang.toLowerCase().trim();

    if (c === t) return true;

    // Chinese variants
    if (t.includes('zh') || t.includes('chinese')) {
      if (t.includes('cn') || t.includes('simplified') || t.includes('chs')) {
        return c.includes('chinese simplified') || c.includes('zh-cn') || c.includes('chs') || c === 'zh' || c === 'chinese' || c.includes('chinese');
      }
      if (t.includes('tw') || t.includes('traditional') || t.includes('cht') || t.includes('hk')) {
        return c.includes('chinese traditional') || c.includes('zh-tw') || c.includes('cht') || c.includes('zh-hk') || c === 'zh' || c === 'chinese' || c.includes('chinese');
      }
      return c.includes('chinese') || c.includes('zh');
    }

    // English variants
    if (t.includes('en') || t.includes('english')) {
      return c.includes('english') || c.includes('en');
    }

    return c.includes(t) || t.includes(c);
  }

  /**
   * Calculate score for a single subtitle candidate
   * @param {Object} candidate - SubDL or general subtitle item
   * @param {Object} media - MediaIdentity { title, season, episode, type, year }
   * @param {string} targetLanguage
   * @returns {number} score
   */
  static scoreCandidate(candidate, media, targetLanguage = 'zh-CN') {
    let score = 0;
    const candidateName = this.normalize(candidate.release_name || candidate.name || candidate.title || '');
    const targetTitle = this.normalize(media.title || '');

    // 1. Title match
    if (targetTitle && candidateName) {
      if (candidateName.includes(targetTitle) || targetTitle.includes(candidateName)) {
        score += 40;
      } else {
        // Compare words
        const targetWords = targetTitle.split(' ').filter(w => w.length > 2);
        const matchCount = targetWords.filter(w => candidateName.includes(w)).length;
        if (targetWords.length > 0) {
          score += Math.round((matchCount / targetWords.length) * 30);
        }
      }
    }

    // 2. TV Show Season and Episode Matching
    if (media.type === 'tv' || media.season !== undefined || media.episode !== undefined) {
      const candidateSeason = candidate.season !== undefined ? candidate.season : candidate.season_number;
      const candidateEpisode = candidate.episode !== undefined ? candidate.episode : candidate.episode_number;

      if (media.season !== undefined) {
        if (candidateSeason !== undefined && candidateSeason !== null) {
          if (Number(candidateSeason) === Number(media.season)) {
            score += 30;
          } else {
            score -= 50; // wrong season
          }
        } else {
          // Check for pattern S02 or S2 in name
          const sRegex = new RegExp(`\\bS0?${media.season}\\b`, 'i');
          if (sRegex.test(candidateName)) {
            score += 25;
          }
        }
      }

      if (media.episode !== undefined) {
        if (candidateEpisode !== undefined && candidateEpisode !== null) {
          if (Number(candidateEpisode) === Number(media.episode)) {
            score += 30;
          } else {
            score -= 50; // wrong episode
          }
        } else {
          // Check for pattern E04 or E4 in name
          const eRegex = new RegExp(`\\bE0?${media.episode}\\b`, 'i');
          if (eRegex.test(candidateName)) {
            score += 25;
          }
        }
      }
    } else {
      // Movie
      if (media.year && candidate.year) {
        if (Math.abs(Number(candidate.year) - Number(media.year)) <= 1) {
          score += 20;
        }
      }
    }

    // 3. Language match
    const lang = candidate.language || candidate.lang || '';
    if (this.isLanguageMatch(lang, targetLanguage)) {
      score += 25;
    } else if (this.isLanguageMatch(lang, 'en')) {
      score += 10; // english fallback
    }

    // 4. Release quality tags
    const rawRelease = (candidate.release_name || candidate.name || '').toUpperCase();
    if (rawRelease.includes('NF') || rawRelease.includes('NETFLIX')) {
      score += 15;
    }
    if (rawRelease.includes('WEB-DL') || rawRelease.includes('WEBRIP') || rawRelease.includes('WEB')) {
      score += 10;
    }
    if (rawRelease.includes('BLURAY') || rawRelease.includes('BDRIP')) {
      score += 8;
    }
    if (rawRelease.includes('CAM') || rawRelease.includes('TELESYNC') || rawRelease.includes('HDCAM')) {
      score -= 30;
    }

    // 5. Provider preference (SubDL is primary verified high-quality source)
    if (candidate.provider === 'SubDL') {
      score += 10;
    }

    return score;
  }

  /**
   * Rank all candidates and return sorted results with top candidates
   * @param {Array<Object>} candidates
   * @param {Object} mediaIdentity
   * @param {string} targetLanguage
   * @param {number} topLimit
   * @returns {Array<Object>}
   */
  static rank(candidates, mediaIdentity, targetLanguage = 'zh-CN', topLimit = 5) {
    if (!Array.isArray(candidates)) return [];

    const scored = candidates.map(candidate => {
      const score = this.scoreCandidate(candidate, mediaIdentity, targetLanguage);
      return {
        ...candidate,
        matchScore: score
      };
    });

    // Sort descending by matchScore
    scored.sort((a, b) => b.matchScore - a.matchScore);

    return scored.slice(0, topLimit);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SubtitleRanking };
}
if (typeof globalThis !== 'undefined') {
  globalThis.SubtitleRanking = SubtitleRanking;
}
