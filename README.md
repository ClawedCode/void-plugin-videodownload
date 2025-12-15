# void-plugin-videodownload

Download videos from X.com (Twitter) with automatic frame extraction for LLM analysis.

## Features

- Download videos from X.com posts
- Automatic frame extraction (5 frames at even intervals)
- Persistent browser authentication (login once, download many)
- Video metadata extraction (duration, file size, tweet info)

## Requirements

- **ffmpeg** - Required for video downloading and frame extraction
  ```bash
  # macOS
  brew install ffmpeg

  # Ubuntu/Debian
  sudo apt install ffmpeg

  # Windows
  choco install ffmpeg
  ```

## Setup

1. Install the plugin in void-server
2. Navigate to the Video Download page
3. Click "Launch Browser" to open a Chromium browser
4. Log into your X.com account in the browser
5. Close the browser window - your session is saved
6. You can now download videos from any X.com post

## Usage

1. Copy the URL of an X.com post containing a video
2. Paste it into the URL field
3. (Optional) Uncheck "Extract frames" if you only want the video
4. Click "Download"

Downloaded videos and frames are saved to the plugin's `data/videos/` directory.

## Privacy

- Your X.com credentials are stored locally in a browser profile
- No data is sent to external servers
- The browser profile is excluded from git via `.gitignore`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/browser/status` | GET | Check authentication status |
| `/browser/launch` | POST | Launch browser for authentication |
| `/browser/close` | POST | Close running browser |
| `/download` | POST | Download video from URL |

### Download Request

```json
{
  "url": "https://x.com/username/status/1234567890",
  "extractFrames": true
}
```

### Download Response

```json
{
  "success": true,
  "videoPath": "/path/to/video.mp4",
  "frames": ["/path/to/frame_1.jpg", ...],
  "metadata": {
    "tweet_id": "1234567890",
    "username": "username",
    "duration_seconds": "15.50",
    "file_size_mb": "2.34",
    "frame_count": 5
  }
}
```

## License

MIT
