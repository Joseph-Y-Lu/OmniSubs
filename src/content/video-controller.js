/**
 * VideoController - Safe HTML5 <video> lifecycle and clock monitor
 * 
 * Strict safety adherence:
 * - Reads ONLY: video.currentTime, video.duration, video.paused, video.playbackRate
 * - NEVER touches: video.src, MediaSource, DRM, Widevine, encrypted media keys
 * - Uses requestAnimationFrame loop while playing for zero-latency 60fps subtitle synchronization
 */

class VideoController {
  constructor() {
    this.videoElement = null;
    this.rafId = null;
    this.searchInterval = null;
    this.listeners = {
      timeUpdate: [],
      play: [],
      pause: [],
      seek: [],
      videoAttached: [],
      videoDetached: []
    };

    this.boundHandlePlay = this.handlePlay.bind(this);
    this.boundHandlePause = this.handlePause.bind(this);
    this.boundHandleTimeUpdate = this.handleTimeUpdate.bind(this);
    this.boundHandleSeeked = this.handleSeeked.bind(this);
    this.boundRafLoop = this.rafLoop.bind(this);
  }

  /**
   * Start searching and monitoring for Netflix <video>
   */
  start() {
    this.stop();
    this.findAndAttachVideo();

    // Check periodically in case Netflix mounts/unmounts video during SPA navigation
    this.searchInterval = setInterval(() => {
      this.findAndAttachVideo();
    }, 1000);
  }

  stop() {
    if (this.searchInterval) {
      clearInterval(this.searchInterval);
      this.searchInterval = null;
    }
    this.stopRaf();
    this.detachVideo();
  }

  findAndAttachVideo() {
    if (typeof document === 'undefined') return;
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) {
      if (this.videoElement) this.detachVideo();
      return;
    }

    let bestVideo = videos[0];
    if (videos.length > 1) {
      // 1. Prefer actively playing video
      const playing = videos.find(v => !v.paused && v.currentTime > 0);
      if (playing) {
        bestVideo = playing;
      } else {
        // 2. Prefer largest visible video
        let maxArea = 0;
        for (const v of videos) {
          const rect = v.getBoundingClientRect();
          const area = rect.width * rect.height;
          if (area > maxArea) {
            maxArea = area;
            bestVideo = v;
          }
        }
      }
    }

    if (bestVideo && bestVideo !== this.videoElement) {
      this.attachVideo(bestVideo);
    }
  }

  attachVideo(video) {
    if (this.videoElement) {
      this.detachVideo();
    }

    this.videoElement = video;
    video.addEventListener('play', this.boundHandlePlay);
    video.addEventListener('pause', this.boundHandlePause);
    video.addEventListener('timeupdate', this.boundHandleTimeUpdate);
    video.addEventListener('seeking', this.boundHandleSeeked);
    video.addEventListener('seeked', this.boundHandleSeeked);
    video.addEventListener('ratechange', this.boundHandleTimeUpdate);

    this.emit('videoAttached', video);

    if (!video.paused) {
      this.startRaf();
    } else {
      this.handleTimeUpdate();
    }
  }

  detachVideo() {
    if (!this.videoElement) return;

    this.videoElement.removeEventListener('play', this.boundHandlePlay);
    this.videoElement.removeEventListener('pause', this.boundHandlePause);
    this.videoElement.removeEventListener('timeupdate', this.boundHandleTimeUpdate);
    this.videoElement.removeEventListener('seeking', this.boundHandleSeeked);
    this.videoElement.removeEventListener('seeked', this.boundHandleSeeked);
    this.videoElement.removeEventListener('ratechange', this.boundHandleTimeUpdate);

    this.videoElement = null;
    this.stopRaf();
    this.emit('videoDetached');
  }

  handlePlay() {
    this.startRaf();
    this.emit('play');
  }

  handlePause() {
    this.stopRaf();
    this.emit('pause');
    this.handleTimeUpdate();
  }

  handleTimeUpdate() {
    if (!this.videoElement) return;
    const time = this.videoElement.currentTime;
    this.emit('timeUpdate', time);
  }

  handleSeeked() {
    if (!this.videoElement) return;
    const time = this.videoElement.currentTime;
    this.emit('seek', time);
    this.emit('timeUpdate', time);
  }

  startRaf() {
    if (this.rafId) return;
    this.rafLoop();
  }

  stopRaf() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  rafLoop() {
    if (this.videoElement && !this.videoElement.paused) {
      const time = this.videoElement.currentTime;
      this.emit('timeUpdate', time);
      this.rafId = requestAnimationFrame(this.boundRafLoop);
    } else {
      this.rafId = null;
    }
  }

  getCurrentTime() {
    return this.videoElement ? this.videoElement.currentTime : 0;
  }

  getDuration() {
    return this.videoElement ? this.videoElement.duration || 0 : 0;
  }

  isPaused() {
    return this.videoElement ? this.videoElement.paused : true;
  }

  getPlaybackRate() {
    return this.videoElement ? this.videoElement.playbackRate : 1.0;
  }

  getVideo() {
    return this.videoElement;
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return () => {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      }
    };
  }

  emit(event, data) {
    if (this.listeners[event]) {
      for (const cb of this.listeners[event]) {
        try { cb(data); } catch (e) { console.error('[VideoController]', e); }
      }
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VideoController };
}
if (typeof globalThis !== 'undefined') {
  globalThis.VideoController = VideoController;
}
