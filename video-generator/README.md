# CodeFlow Video Generator

Generate a professional promotional video for CodeFlow using AI video generation APIs.

## Features

- **9 Video Scenes** - Problem, Solution, Features, Impact, CTA
- **AI Video Generation** - Google Veo via inference.sh
- **FFmpeg Integration** - Automatic clip combination
- **Voiceover Support** - ElevenLabs TTS integration
- **Cross-Platform** - Works on Windows, macOS, Linux

## Quick Start

### 1. Install Dependencies

```bash
cd video-generator
npm install
```

### 2. Configure API Keys

```bash
cp .env.example .env
# Edit .env with your API keys
```

**Required API Keys:**

| Provider | Purpose | Get Key |
|----------|---------|---------|
| inference.sh | Video generation | [inference.sh](https://inference.sh) |
| ElevenLabs | Voiceover (optional) | [elevenlabs.io](https://elevenlabs.io) |

### 3. Generate Video

```bash
# Preview scenes
npm run preview

# Generate video clips
npm run generate

# Combine clips
npm run combine
```

## Video Scenes

| # | Scene | Duration | Description |
|---|-------|----------|-------------|
| 1 | The Problem | 0:00-0:25 | Frustrated developer, complex code |
| 2 | The Solution | 0:25-0:50 | CodeFlow logo, holographic interface |
| 3 | Architecture Explorer | 0:50-1:00 | Force-directed graph, module analysis |
| 4 | Learning Path | 1:00-1:10 | Learning modules, time estimates |
| 5 | First PR | 1:10-1:20 | GitHub PR, green checkmarks |
| 6 | Q&A Demo | 1:20-1:30 | AI chat, streaming response |
| 7 | Dashboard | 1:30-1:50 | CTO dashboard, charts |
| 8 | Impact | 2:10-2:25 | Before/after, celebration |
| 9 | CTA | 2:25-2:40 | Logo, URL, call to action |

## Output

```
output/
├── scene-01-problem.mp4
├── scene-02-solution.mp4
├── scene-03-architecture.mp4
├── scene-04-learning.mp4
├── scene-05-first-pr.mp4
├── scene-06-qa.mp4
├── scene-07-dashboard.mp4
├── scene-08-impact.mp4
├── scene-09-cta.mp4
├── concat.txt
└── codeflow-final.mp4
```

## Manual FFmpeg Combination

If you prefer to combine clips manually:

```bash
# Create file list
ls output/scene-*.mp4 | sed "s/^/file '/" | sed "s/$/'/" > output/concat.txt

# Combine with FFmpeg
ffmpeg -f concat -safe 0 -i output/concat.txt \
  -c:v libx264 -crf 23 -preset medium \
  -c:a aac -b:a 192k \
  output/codeflow-final.mp4
```

## Customization

### Change Video Quality

Edit `.env`:

```bash
VIDEO_WIDTH=3840  # 4K
VIDEO_HEIGHT=2160
VIDEO_FPS=60
```

### Modify Scenes

Edit `generate-video.js` to customize:
- Scene prompts
- Duration
- Model selection
- Order

### Add Voiceover

1. Generate voiceover with ElevenLabs
2. Add audio track with FFmpeg:

```bash
ffmpeg -i output/codeflow-final.mp4 \
  -i voiceover.mp3 \
  -c:v copy -c:a aac \
  -map 0:v -map 1:a \
  output/codeflow-with-voiceover.mp4
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| FFmpeg not found | Run `npm install ffmpeg-static` |
| API key invalid | Check `.env` file |
| Video too large | Lower resolution in `.env` |
| Generation slow | Use faster model (veo-3-1-fast) |

## License

MIT
