/**
 * PublicSubsAdapter - Zero-Config Public Subtitle Provider
 * 
 * Queries public subtitle indexes (YTS Subs) without requiring any API keys.
 * Supports direct download of .srt/.zip files and feeds into the auto-translation pipeline.
 */

class PublicSubsAdapter extends (typeof SubtitleProvider !== 'undefined' ? SubtitleProvider : ((typeof require !== 'undefined') ? require('./provider.js').SubtitleProvider : class {})) {
  constructor() {
    super('PublicSubs');
    this.searchBase = 'https://yts-subs.com';
  }

  async search(mediaIdentity, language = 'zh-CN') {
    if (!mediaIdentity || !mediaIdentity.title) return [];

    const cleanTitle = mediaIdentity.title
      .replace(/^Netflix Video.*$/i, '')
      .trim();

    if (!cleanTitle) return [];

    try {
      const searchUrl = `${this.searchBase}/search/${encodeURIComponent(cleanTitle)}`;
      const res = await fetch(searchUrl);
      if (!res.ok) return [];

      const html = await res.text();

      // Find movie link in search results: e.g. <a href="/movie-imdb/tt4058618">
      const movieMatch = /href="(\/movie-imdb\/[^"]+)"/i.exec(html);
      if (!movieMatch) return [];

      const moviePageUrl = `${this.searchBase}${movieMatch[1]}`;
      const movieRes = await fetch(moviePageUrl);
      if (!movieRes.ok) return [];

      const movieHtml = await movieRes.text();

      // Parse subtitle entries:
      // Pattern: <span class="sub-lang">English</span> ... data-link="aHR0cHM6..."
      // Or: <a href="/subtitles/the-thicket-..." class="subtitle-download">download</a>
      const results = [];
      const rowRegex = /<span class="sub-lang">([^<]+)<\/span>[\s\S]*?<a href="(\/subtitles\/[^"]+)" class="subtitle-download"/gi;
      let match;

      while ((match = rowRegex.exec(movieHtml)) !== null) {
        const lang = match[1].trim();
        const subPage = match[2];

        results.push({
          id: subPage,
          provider: 'PublicSubs',
          title: cleanTitle,
          release_name: `${cleanTitle}.${lang}.Public`,
          language: lang,
          subPageUrl: `${this.searchBase}${subPage}`,
          source: 'Public'
        });
      }

      return results;
    } catch (e) {
      console.warn('[PublicSubs] Search error:', e);
      return [];
    }
  }

  async download(result) {
    if (!result || !result.subPageUrl) {
      throw new Error('[PublicSubs] Missing download page URL');
    }

    try {
      // 1. Fetch subtitle detail page
      const pageRes = await fetch(result.subPageUrl);
      if (!pageRes.ok) throw new Error(`Detail page failed: HTTP ${pageRes.status}`);

      const html = await pageRes.text();

      // 2. Extract base64 data-link from download button:
      // e.g. <a id="btn-download-subtitle" ... data-link="aHR0cHM6Ly9zdWJ0aXRs...">
      const linkMatch = /data-link="([^"]+)"/i.exec(html);
      if (!linkMatch) throw new Error('[PublicSubs] Subtitle download link not found');

      // 3. Decode base64 URL
      let downloadUrl = '';
      if (typeof atob !== 'undefined') {
        downloadUrl = atob(linkMatch[1]);
      } else {
        downloadUrl = Buffer.from(linkMatch[1], 'base64').toString('utf-8');
      }

      if (!downloadUrl.startsWith('http')) {
        throw new Error('[PublicSubs] Invalid decoded download URL');
      }

      // 4. Download file
      const zipRes = await fetch(downloadUrl);
      if (!zipRes.ok) throw new Error(`Download failed: HTTP ${zipRes.status}`);

      const arrayBuffer = await zipRes.arrayBuffer();
      return await this.extractSrtFromZip(arrayBuffer);
    } catch (err) {
      console.error('[PublicSubs] Download error:', err);
      throw err;
    }
  }

  async extractSrtFromZip(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    let offset = 0;
    while (offset < bytes.length - 30) {
      if (view.getUint32(offset, true) === 0x04034b50) {
        const compressionMethod = view.getUint16(offset + 8, true);
        const compressedSize = view.getUint32(offset + 18, true);
        const uncompressedSize = view.getUint32(offset + 22, true);
        const filenameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);

        const filenameBytes = bytes.slice(offset + 30, offset + 30 + filenameLen);
        const filename = new TextDecoder('utf-8').decode(filenameBytes);

        const dataOffset = offset + 30 + filenameLen + extraLen;
        const fileData = bytes.slice(dataOffset, dataOffset + compressedSize);

        if (filename.toLowerCase().endsWith('.srt') || filename.toLowerCase().endsWith('.vtt')) {
          if (compressionMethod === 0) {
            return new TextDecoder('utf-8').decode(fileData);
          } else if (compressionMethod === 8) {
            if (typeof DecompressionStream !== 'undefined') {
              const stream = new ReadableStream({
                start(controller) {
                  controller.enqueue(fileData);
                  controller.close();
                }
              }).pipeThrough(new DecompressionStream('deflate-raw'));

              const response = new Response(stream);
              return await response.text();
            }
          }
        }
        offset = dataOffset + compressedSize;
      } else {
        offset++;
      }
    }

    throw new Error('No .srt subtitle found in downloaded ZIP.');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PublicSubsAdapter };
}
if (typeof globalThis !== 'undefined') {
  globalThis.PublicSubsAdapter = PublicSubsAdapter;
}
