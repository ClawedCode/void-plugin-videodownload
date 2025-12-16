const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

/**
 * Video Downloader Service
 *
 * Downloads videos from X.com using browser profiles from void-server core.
 * Requires a browser profile to be created and authenticated via the Browsers page.
 */
class VideoDownloader {
  constructor(videosDir) {
    this.VIDEOS_DIR = videosDir;
  }

  log(message, level = 'info') {
    const emoji = {
      info: '📹',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    }[level] || '📹';
    console.log(`${emoji} [VideoDownloader] ${message}`);
  }

  /**
   * Extract tweet ID from X.com URL
   */
  extractTweetId(url) {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract username from X.com URL
   */
  extractUsername(url) {
    const match = url.match(/x\.com\/([^/]+)\/status/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Check if ffmpeg is installed
   */
  async checkFfmpeg() {
    return new Promise((resolve) => {
      const check = spawn('which', ['ffmpeg']);
      check.on('close', (code) => resolve(code === 0));
    });
  }

  /**
   * Get video duration using ffprobe
   */
  async getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => { output += data.toString(); });
      ffprobe.on('close', (code) => {
        if (code === 0) resolve(parseFloat(output.trim()));
        else reject(new Error('Failed to get video duration'));
      });
    });
  }

  /**
   * Extract frames from video at specific positions
   */
  async extractFrames(videoPath, outputDir, count = 5) {
    const duration = await this.getVideoDuration(videoPath);
    const frames = [];

    this.log(`Extracting ${count} frames from ${duration.toFixed(2)}s video`);

    const positions = Array.from({ length: count }, (_, i) => {
      const position = ((i + 1) / count) * duration;
      return i === count - 1 ? Math.max(0, position - 0.5) : position;
    });

    for (let i = 0; i < positions.length; i++) {
      const timestamp = positions[i];
      const framePath = path.join(outputDir, `frame_${i + 1}.jpg`);

      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-ss', timestamp.toString(),
          '-i', videoPath,
          '-vframes', '1',
          '-q:v', '2',
          '-y',
          framePath
        ]);

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            this.log(`Extracted frame ${i + 1}/${count} at ${timestamp.toFixed(2)}s`);
            frames.push(framePath);
            resolve();
          } else {
            reject(new Error(`Failed to extract frame ${i + 1}`));
          }
        });
      });
    }

    return frames;
  }

  /**
   * Download video from X.com URL using browser profile from core
   */
  async downloadVideoFile(url, outputPath, browserService, browserId) {
    this.log(`Opening browser to capture video from: ${url}`);

    // Get browser context from core service
    const context = await browserService.getBrowserContext(browserId);

    const page = await context.newPage();
    const videoUrls = [];

    // Track video URLs from network requests
    // The main tweet's video loads first since it's higher in the DOM
    page.on('response', (response) => {
      const responseUrl = response.url();
      const contentType = response.headers()['content-type'] || '';

      if (contentType.includes('video') ||
          responseUrl.includes('.mp4') ||
          responseUrl.includes('video.twimg.com') ||
          responseUrl.includes('/ext_tw_video/') ||
          responseUrl.includes('.m3u8')) {
        this.log(`Found video URL: ${responseUrl.substring(0, 80)}...`);
        videoUrls.push({
          url: responseUrl,
          contentType,
          status: response.status(),
          timestamp: Date.now()
        });
      }
    });

    this.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    // If we captured videos during page load, use the first one (main tweet's video)
    // The main tweet video loads first since it's higher in the DOM
    if (videoUrls.length > 0) {
      this.log(`Found ${videoUrls.length} video(s) during page load, using first (main tweet)`);
    } else {
      // No videos captured during page load - try clicking play button
      this.log('No videos during page load, looking for play button...');

      // Try clicking the FIRST play button (should be main tweet's if it has one)
      const playButton = await page.$('[data-testid="playButton"], [aria-label="Play"]');
      if (playButton) {
        this.log('Clicking play button...');
        await playButton.click();
        await page.waitForTimeout(3000);
      }
    }

    await page.close();
    await context.close();

    if (videoUrls.length === 0) {
      throw new Error('No video found in this tweet');
    }

    // Extract video ID from URL to group by tweet/video
    // X.com URLs look like: video.twimg.com/ext_tw_video/[VIDEO_ID]/... or amplify_video/[VIDEO_ID]/...
    const getVideoId = (url) => {
      const match = url.match(/(?:ext_tw_video|amplify_video)\/(\d+)/);
      return match ? match[1] : null;
    };

    // Extract tweet ID from the URL to match against video IDs
    const tweetId = this.extractTweetId(url);
    const tweetIdNum = tweetId ? BigInt(tweetId) : null;

    // Group videos by their video ID
    const videoGroups = new Map();
    for (const v of videoUrls) {
      const id = getVideoId(v.url);
      if (id) {
        if (!videoGroups.has(id)) {
          videoGroups.set(id, { videos: [] });
        }
        videoGroups.get(id).videos.push(v);
      }
    }

    // Find the video group whose ID is closest to the tweet ID
    // The main tweet's video ID should be very close to or match the tweet ID
    let mainTweetVideos = videoUrls;
    if (videoGroups.size > 0 && tweetIdNum) {
      const sortedGroups = [...videoGroups.entries()].sort((a, b) => {
        const aDiff = tweetIdNum - BigInt(a[0]);
        const bDiff = tweetIdNum - BigInt(b[0]);
        // Prefer positive differences (video ID slightly before tweet ID) and closest match
        const aAbs = aDiff < 0n ? -aDiff : aDiff;
        const bAbs = bDiff < 0n ? -bDiff : bDiff;
        return aAbs < bAbs ? -1 : aAbs > bAbs ? 1 : 0;
      });

      const selectedGroup = sortedGroups[0];
      mainTweetVideos = selectedGroup[1].videos;
      this.log(`Found ${videoGroups.size} video group(s), selected ID ${selectedGroup[0]} (closest to tweet ${tweetId}) with ${mainTweetVideos.length} URLs`);
    } else {
      this.log(`Found ${videoGroups.size} video group(s), using all ${mainTweetVideos.length} URLs`);
    }

    // Find best video URL from main tweet's videos
    const hlsPlaylists = mainTweetVideos
      .filter(v => v.status === 200 && v.url.includes('.m3u8'))
      .filter(v => v.url.match(/\/\d+x\d+\//) || v.url.includes('pl/avc1'))
      .sort((a, b) => {
        const aRes = a.url.match(/\/(\d+)x(\d+)\//);
        const bRes = b.url.match(/\/(\d+)x(\d+)\//);
        const aPixels = aRes ? parseInt(aRes[1]) * parseInt(aRes[2]) : 0;
        const bPixels = bRes ? parseInt(bRes[1]) * parseInt(bRes[2]) : 0;
        return bPixels - aPixels;
      });

    let downloadUrl;
    let isHLS = false;

    if (hlsPlaylists.length > 0) {
      downloadUrl = hlsPlaylists[0].url;
      isHLS = true;
      this.log(`Found HLS stream (highest quality)`);
    } else {
      const mp4Videos = mainTweetVideos
        .filter(v => v.status === 200 && v.url.includes('.mp4') && !v.url.includes('.m4s'))
        .sort((a, b) => {
          const aRes = a.url.match(/(\d+)x(\d+)/);
          const bRes = b.url.match(/(\d+)x(\d+)/);
          const aPixels = aRes ? parseInt(aRes[1]) * parseInt(aRes[2]) : 0;
          const bPixels = bRes ? parseInt(bRes[1]) * parseInt(bRes[2]) : 0;
          return bPixels - aPixels;
        });

      if (mp4Videos.length > 0) {
        downloadUrl = mp4Videos[0].url;
        this.log(`Found MP4 (highest quality)`);
      }
    }

    if (!downloadUrl) {
      throw new Error('Could not find downloadable video URL');
    }

    this.log(`Downloading video...`);

    return new Promise((resolve, reject) => {
      if (isHLS) {
        const ffmpeg = spawn('ffmpeg', [
          '-i', downloadUrl,
          '-c', 'copy',
          '-bsf:a', 'aac_adtstoasc',
          '-y',
          outputPath
        ]);

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            this.log('Video downloaded successfully', 'success');
            resolve(outputPath);
          } else {
            reject(new Error('Failed to download HLS video'));
          }
        });

        ffmpeg.on('error', (err) => reject(err));
      } else {
        const curl = spawn('curl', ['-L', '-o', outputPath, '-s', downloadUrl]);

        curl.on('close', (code) => {
          if (code === 0) {
            this.log('Video downloaded successfully', 'success');
            resolve(outputPath);
          } else {
            reject(new Error('Failed to download video'));
          }
        });

        curl.on('error', (err) => reject(err));
      }
    });
  }

  /**
   * Get total frame count from video using ffprobe
   */
  async getTotalFrameCount(videoPath) {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-count_frames',
        '-show_entries', 'stream=nb_read_frames',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => { output += data.toString(); });
      ffprobe.on('close', (code) => {
        if (code === 0) resolve(parseInt(output.trim()) || 0);
        else reject(new Error('Failed to get frame count'));
      });
    });
  }

  /**
   * Extract all frames from video
   */
  async extractAllFrames(videoPath, outputDir) {
    this.log('Extracting all frames from video...');

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-q:v', '2',
        '-y',
        path.join(outputDir, 'frame_%d.jpg')
      ]);

      ffmpeg.on('close', async (code) => {
        if (code === 0) {
          // Get list of extracted frames
          const fs = require('fs').promises;
          const files = await fs.readdir(outputDir);
          const frames = files
            .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
            .sort((a, b) => {
              const aNum = parseInt(a.match(/frame_(\d+)/)[1]);
              const bNum = parseInt(b.match(/frame_(\d+)/)[1]);
              return aNum - bNum;
            })
            .map(f => path.join(outputDir, f));

          this.log(`Extracted ${frames.length} frames`, 'success');
          resolve(frames);
        } else {
          reject(new Error('Failed to extract all frames'));
        }
      });
    });
  }

  /**
   * Main download method
   */
  async downloadVideo(url, browserService, browserId, options = {}) {
    const { frameCount = 5 } = options;
    const shouldExtractFrames = frameCount === 'all' || (typeof frameCount === 'number' && frameCount > 0);

    // Validate ffmpeg
    if (shouldExtractFrames) {
      const hasFfmpeg = await this.checkFfmpeg();
      if (!hasFfmpeg) {
        throw new Error('ffmpeg is not installed. Install with: brew install ffmpeg');
      }
    }

    const tweetId = this.extractTweetId(url);
    const username = this.extractUsername(url);

    if (!tweetId) {
      throw new Error('Invalid X.com URL - could not extract tweet ID');
    }

    this.log(`Downloading video from @${username} (${tweetId})`);

    await fs.mkdir(this.VIDEOS_DIR, { recursive: true });

    const videoDir = path.join(this.VIDEOS_DIR, `${username}_${tweetId}`);
    await fs.mkdir(videoDir, { recursive: true });

    const videoPath = path.join(videoDir, 'video.mp4');

    await this.downloadVideoFile(url, videoPath, browserService, browserId);

    const stats = await fs.stat(videoPath);
    const duration = await this.getVideoDuration(videoPath);

    let frames = [];
    if (frameCount === 'all') {
      frames = await this.extractAllFrames(videoPath, videoDir);
    } else if (typeof frameCount === 'number' && frameCount > 0) {
      frames = await this.extractFrames(videoPath, videoDir, frameCount);
    }

    const metadata = {
      tweet_id: tweetId,
      username,
      url,
      downloaded_at: new Date().toISOString(),
      file_size: stats.size,
      file_size_mb: (stats.size / (1024 * 1024)).toFixed(2),
      duration_seconds: duration.toFixed(2),
      frame_count: frames.length,
      browser_profile: browserId
    };

    await fs.writeFile(path.join(videoDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    this.log(`Successfully downloaded video and extracted ${frames.length} frames`, 'success');

    return { videoPath, frames, metadata };
  }
}

module.exports = VideoDownloader;
