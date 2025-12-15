const path = require('path');
const VideoDownloader = require('./services/video-downloader');

module.exports = (app, config = {}) => {
  const { mountPath = '/video-download', services = {} } = config;
  const PLUGIN_ROOT = path.join(__dirname, '..');
  const VIDEOS_DIR = path.join(PLUGIN_ROOT, 'data', 'videos');
  const videoDownloader = new VideoDownloader(PLUGIN_ROOT);

  // Get services from core
  const browserService = services.browserService || null;
  const express = services.express || null;

  if (!browserService) {
    console.log('⚠️ [VideoDownload] Core browser service not available');
  }

  // Serve downloaded videos and frames as static files
  if (express) {
    app.use('/api/video-download/files', express.static(VIDEOS_DIR));
  }

  console.log(`📹 Video Download Plugin mounted at ${mountPath}`);

  // Download video using a browser profile from core
  app.post('/api/video-download/download', async (req, res) => {
    const { url, browserId, frameCount = 5 } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    if (!browserId) {
      return res.status(400).json({ success: false, error: 'Browser profile ID is required' });
    }

    if (!url.match(/x\.com\/[^/]+\/status\/\d+/)) {
      return res.status(400).json({ success: false, error: 'Invalid X.com URL format' });
    }

    if (!browserService) {
      return res.status(500).json({
        success: false,
        error: 'Browser service not available. Make sure void-server core is properly configured.'
      });
    }

    console.log(`📹 POST /api/video-download/download url=${url} browser=${browserId} frameCount=${frameCount}`);

    // Check browser profile exists and is authenticated
    const browserStatus = await browserService.getBrowserStatus(browserId);
    if (!browserStatus.success) {
      return res.status(404).json({ success: false, error: 'Browser profile not found' });
    }

    if (!browserStatus.authenticated) {
      return res.status(401).json({
        success: false,
        error: 'Browser profile not authenticated. Go to Browsers page to authenticate.'
      });
    }

    videoDownloader.downloadVideo(url, browserService, browserId, { frameCount }).then((result) => {
      console.log(`✅ Video download complete: ${result.videoPath}`);

      // Build web-accessible URLs for video and frames
      const videoDir = `${result.metadata.username}_${result.metadata.tweet_id}`;
      const videoUrl = `/api/video-download/files/${videoDir}/video.mp4`;
      const frameUrls = result.frames.map((_, i) => `/api/video-download/files/${videoDir}/frame_${i + 1}.jpg`);

      res.json({
        success: true,
        videoPath: result.videoPath,
        videoUrl,
        frames: result.frames,
        frameUrls,
        metadata: result.metadata
      });
    }).catch((error) => {
      console.log(`❌ Video download failed: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    });
  });
};
