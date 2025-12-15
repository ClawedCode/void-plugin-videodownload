import { useState, useEffect } from 'react';
import { Download, Video, Image as ImageIcon, AlertCircle, Globe, CheckCircle, XCircle, RefreshCw, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

export default function VideoDownloadPage() {
  const [url, setUrl] = useState('https://x.com/ClawedCode/status/1989594664685752738');
  const [frameCount, setFrameCount] = useState(5);
  const [extractAllFrames, setExtractAllFrames] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState(null);
  const [browsers, setBrowsers] = useState([]);
  const [selectedBrowser, setSelectedBrowser] = useState('');
  const [loadingBrowsers, setLoadingBrowsers] = useState(true);

  useEffect(() => {
    loadBrowsers();
  }, []);

  const loadBrowsers = async () => {
    setLoadingBrowsers(true);
    const response = await fetch('/api/browsers');
    const data = await response.json();

    if (data.success) {
      setBrowsers(data.browsers);
      // Auto-select first authenticated browser
      const authBrowser = data.browsers.find(b => b.authenticated);
      if (authBrowser) {
        setSelectedBrowser(authBrowser.id);
      }
    }
    setLoadingBrowsers(false);
  };

  const handleDownload = async () => {
    if (!url.trim()) {
      toast.error('Please enter an X.com URL');
      return;
    }

    if (!selectedBrowser) {
      toast.error('Please select a browser profile');
      return;
    }

    if (!url.match(/x\.com\/[^/]+\/status\/\d+/)) {
      toast.error('Invalid X.com URL format');
      return;
    }

    setDownloading(true);
    setResult(null);

    const response = await fetch('/api/video-download/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        browserId: selectedBrowser,
        frameCount: extractAllFrames ? 'all' : frameCount
      })
    });

    const data = await response.json();
    setDownloading(false);

    if (data.success) {
      setResult(data);
      toast.success('Video downloaded successfully');
    } else {
      toast.error(data.error || 'Failed to download video');
    }
  };

  const handleClear = () => {
    setUrl('');
    setResult(null);
  };

  const authenticatedBrowsers = browsers.filter(b => b.authenticated);
  const hasAuthenticatedBrowser = authenticatedBrowsers.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Download className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Video Download</h1>
            <p className="text-secondary text-sm">Download videos from X.com with automatic frame extraction</p>
          </div>
        </div>
        <button onClick={loadBrowsers} className="btn btn-ghost p-2" title="Refresh browsers">
          <RefreshCw size={18} className={loadingBrowsers ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* No Browser Profiles Warning */}
      {!loadingBrowsers && browsers.length === 0 && (
        <div className="card border-warning bg-warning/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-text-primary">No Browser Profiles</h3>
              <p className="text-secondary text-sm mt-1">
                You need to create a browser profile and authenticate with X.com before downloading videos.
              </p>
              <a href="/browsers" className="btn btn-primary btn-sm mt-3 inline-flex items-center gap-2">
                <Globe size={16} />
                Go to Browsers
              </a>
            </div>
          </div>
        </div>
      )}

      {/* No Authenticated Browser Warning */}
      {!loadingBrowsers && browsers.length > 0 && !hasAuthenticatedBrowser && (
        <div className="card border-warning bg-warning/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-text-primary">Authentication Required</h3>
              <p className="text-secondary text-sm mt-1">
                Your browser profiles are not authenticated. Launch a browser and log into X.com.
              </p>
              <a href="/browsers" className="btn btn-primary btn-sm mt-3 inline-flex items-center gap-2">
                <Globe size={16} />
                Authenticate Browser
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Download Form */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Download Video</h2>

        {/* Browser Profile Selector */}
        <div>
          <label className="block text-sm font-medium text-secondary mb-2">
            Browser Profile
          </label>
          <select
            value={selectedBrowser}
            onChange={(e) => setSelectedBrowser(e.target.value)}
            className="form-select w-full"
            disabled={downloading || !hasAuthenticatedBrowser}
          >
            <option value="">Select a browser profile...</option>
            {browsers.map(browser => (
              <option key={browser.id} value={browser.id} disabled={!browser.authenticated}>
                {browser.name || browser.id} {browser.authenticated ? '✓' : '(not authenticated)'}
              </option>
            ))}
          </select>
          {selectedBrowser && (
            <p className="text-xs text-success mt-1 flex items-center gap-1">
              <CheckCircle size={12} />
              Using authenticated session
            </p>
          )}
        </div>

        {/* URL Input */}
        <div>
          <label className="block text-sm font-medium text-secondary mb-2">
            X.com Post URL
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://x.com/username/status/1234567890"
              className="form-input flex-1"
              disabled={downloading || !hasAuthenticatedBrowser}
              onKeyPress={(e) => e.key === 'Enter' && handleDownload()}
            />
            <button
              onClick={handleDownload}
              disabled={downloading || !url.trim() || !selectedBrowser}
              className="btn btn-primary flex items-center gap-2"
            >
              <Download size={18} />
              {downloading ? 'Downloading...' : 'Download'}
            </button>
            {result && (
              <button onClick={handleClear} className="btn btn-secondary">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Frame Extraction Options */}
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-secondary">Frames:</label>
              <input
                type="number"
                value={frameCount}
                onChange={(e) => setFrameCount(Math.max(0, parseInt(e.target.value) || 0))}
                disabled={downloading || !hasAuthenticatedBrowser || extractAllFrames}
                className="form-input w-20 text-center"
                min="0"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={extractAllFrames}
                onChange={(e) => setExtractAllFrames(e.target.checked)}
                disabled={downloading || !hasAuthenticatedBrowser}
                className="form-checkbox"
              />
              <span className="text-sm text-secondary">Extract all frames</span>
            </label>
          </div>
          <p className="text-xs text-tertiary">
            {extractAllFrames
              ? 'Warning: Extracts every frame from the video. This can create many files.'
              : frameCount > 0
                ? `Extracts ${frameCount} frames evenly distributed across the video.`
                : 'Frame extraction disabled.'}
          </p>
        </div>

        <p className="text-xs text-tertiary">
          Downloads video using browser automation. {(frameCount > 0 || extractAllFrames) && 'Requires ffmpeg.'}
        </p>
      </div>

      {/* Loading State */}
      {downloading && (
        <div className="card flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={32} className="text-primary animate-spin" />
            <p className="text-secondary">Downloading video and extracting frames...</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Video Info */}
          <div className="card border-success">
            <div className="flex items-start gap-3 mb-4">
              <Video size={24} className="text-success" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-text-primary">
                  Video Downloaded Successfully
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                  <div>
                    <span className="text-secondary">Username:</span>
                    <span className="ml-2 font-mono text-text-primary">@{result.metadata?.username}</span>
                  </div>
                  <div>
                    <span className="text-secondary">Tweet ID:</span>
                    <span className="ml-2 font-mono text-text-primary">{result.metadata?.tweet_id}</span>
                  </div>
                  <div>
                    <span className="text-secondary">Duration:</span>
                    <span className="ml-2 text-text-primary">{result.metadata?.duration_seconds}s</span>
                  </div>
                  <div>
                    <span className="text-secondary">Size:</span>
                    <span className="ml-2 text-text-primary">{result.metadata?.file_size_mb} MB</span>
                  </div>
                  <div>
                    <span className="text-secondary">Frames:</span>
                    <span className="ml-2 text-text-primary">{result.metadata?.frame_count} extracted</span>
                  </div>
                  <div>
                    <span className="text-secondary">Downloaded:</span>
                    <span className="ml-2 text-xs text-text-primary">
                      {new Date(result.metadata?.downloaded_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-sm text-secondary mb-2">File Path:</p>
              <code className="block px-3 py-2 rounded text-xs font-mono bg-surface-alt text-text-primary">
                {result.videoPath}
              </code>
            </div>
          </div>

          {/* Video Player */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Video size={20} className="text-primary" />
              <h3 className="text-lg font-semibold text-text-primary">Video Preview</h3>
            </div>
            <video
              src={result.videoUrl}
              controls
              className="w-full rounded-lg bg-black"
              style={{ maxHeight: '480px' }}
            >
              Your browser does not support the video tag.
            </video>
          </div>

          {/* Extracted Frames */}
          {result.frameUrls && result.frameUrls.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <ImageIcon size={20} className="text-primary" />
                <h3 className="text-lg font-semibold text-text-primary">
                  Extracted Frames ({result.frameUrls.length})
                </h3>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {result.frameUrls.map((frameUrl, index) => (
                  <a
                    key={index}
                    href={frameUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg overflow-hidden border border-border hover:border-primary transition-colors group"
                  >
                    <div className="aspect-video bg-surface-alt">
                      <img
                        src={frameUrl}
                        alt={`Frame ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-2 text-center text-xs bg-surface text-secondary group-hover:text-primary">
                      Frame {index + 1}
                    </div>
                  </a>
                ))}
              </div>

              <div className="mt-4 p-3 rounded-lg bg-info/10 flex items-start gap-2">
                <AlertCircle size={16} className="text-info flex-shrink-0 mt-0.5" />
                <p className="text-xs text-secondary">
                  Click a frame to view full size. Frames are extracted at evenly distributed timestamps.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
