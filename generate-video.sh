#!/bin/bash
# CodeFlow Video Generation Script
# Using RunComfy CLI with HappyHorse 1.0

set -e

OUTPUT_DIR="./codeflow-video-clips"
mkdir -p "$OUTPUT_DIR"

echo "========================================"
echo "CodeFlow Video Generation (RunComfy)"
echo "========================================"
echo ""

# Check if runcomfy is installed
if ! command -v runcomfy &> /dev/null; then
    echo "Installing RunComfy CLI..."
    npm i -g @runcomfy/cli
fi

# Login check
echo "Checking RunComfy login..."
runcomfy whoami || runcomfy login

echo ""
echo "Generating Scene 1: The Problem..."
runcomfy run happyhorse/happyhorse-1-0/text-to-video \
  --input '{
    "prompt": "A developer sits frustrated at a desk with multiple monitors showing complex code, dark moody office, rain on windows, soft keyboard clicking sounds. Audio: rain, keyboard clicks, sigh.",
    "duration": 8,
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }' \
  --output-dir "$OUTPUT_DIR"

echo ""
echo "Generating Scene 2: The Solution..."
runcomfy run happyhorse/happyhorse-1-0/text-to-video \
  --input '{
    "prompt": "A bright flash reveals a futuristic holographic interface showing code analysis, glowing blue nodes connecting in a network graph, dark background with particle effects. Audio: synth swell, digital chime.",
    "duration": 8,
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }' \
  --output-dir "$OUTPUT_DIR"

echo ""
echo "Generating Scene 3: Architecture Explorer..."
runcomfy run happyhorse/happyhorse-1-0/text-to-video \
  --input '{
    "prompt": "Screen recording of modern web application, clean dark UI with blue neon accents, force-directed graph animating, smooth professional demo. Audio: soft ambient electronic.",
    "duration": 6,
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }' \
  --output-dir "$OUTPUT_DIR"

echo ""
echo "Generating Scene 4: Learning Path..."
runcomfy run happyhorse/happyhorse-1-0/text-to-video \
  --input '{
    "prompt": "Animated learning path with 5 modules appearing step by step, time estimates showing, clean modern dark UI, blue accent colors. Audio: subtle UI clicks.",
    "duration": 6,
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }' \
  --output-dir "$OUTPUT_DIR"

echo ""
echo "Generating Scene 5: First PR..."
runcomfy run happyhorse/happyhorse-1-0/text-to-video \
  --input '{
    "prompt": "Developer creating first pull request on GitHub, green checkmarks appearing, success animation, modern office, celebration. Audio: success chime.",
    "duration": 6,
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }' \
  --output-dir "$OUTPUT_DIR"

echo ""
echo "Generating Scene 6: Q&A Demo..."
runcomfy run happyhorse/happyhorse-1-0/text-to-video \
  --input '{
    "prompt": "AI chat interface with streaming text response, file references highlighted in blue, modern dark UI, professional software demo. Audio: soft typing sounds.",
    "duration": 6,
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }' \
  --output-dir "$OUTPUT_DIR"

echo ""
echo "Generating Scene 7: Dashboard..."
runcomfy run happyhorse/happyhorse-1-0/text-to-video \
  --input '{
    "prompt": "CTO dashboard with animated charts, pie charts, bar graphs updating in real-time, team analytics, dark theme with blue accents. Audio: ambient electronic.",
    "duration": 8,
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }' \
  --output-dir "$OUTPUT_DIR"

echo ""
echo "Generating Scene 8: Impact..."
runcomfy run happyhorse/happyhorse-1-0/text-to-video \
  --input '{
    "prompt": "Team of developers celebrating, high-fiving, confetti falling, bright modern office, success atmosphere. Audio: cheering, celebration sounds.",
    "duration": 6,
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }' \
  --output-dir "$OUTPUT_DIR"

echo ""
echo "Generating Scene 9: CTA..."
runcomfy run happyhorse/happyhorse-1-0/text-to-video \
  --input '{
    "prompt": "Professional tech logo animation on dark background, clean minimal design, URL text appearing, call to action. Audio: uplifting synth.",
    "duration": 5,
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }' \
  --output-dir "$OUTPUT_DIR"

echo ""
echo "========================================"
echo "All clips generated in $OUTPUT_DIR"
echo "========================================"
echo ""
echo "To combine clips with FFmpeg:"
echo "  ffmpeg -f concat -safe 0 -i filelist.txt -c copy codeflow-final.mp4"
echo ""
