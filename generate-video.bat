@echo off
REM CodeFlow Video Generation Script
REM Using Google Veo via inference.sh CLI

echo ========================================
echo CodeFlow Video Generation
echo ========================================
echo.

REM Check if belt is installed
where belt >nul 2>nul
if %errorlevel% neq 0 (
    echo Installing inference.sh CLI (belt)...
    call npx skills add belt-sh/cli
)

REM Create output directory
if not exist "codeflow-video-clips" mkdir "codeflow-video-clips"

echo.
echo Generating Scene 1: The Problem...
belt app run google/veo-3-1-fast --input "{\"prompt\": \"Cinematic shot of frustrated software developer staring at multiple monitors filled with complex code, dark office lighting, rain on windows, photorealistic, 4K, slow motion\"}"

echo.
echo Generating Scene 2: The Solution...
belt app run google/veo-3-1-fast --input "{\"prompt\": \"Futuristic holographic interface showing code analysis, glowing blue nodes connecting in a network graph, dark background with particle effects, tech aesthetic, 4K\"}"

echo.
echo Generating Scene 3: Architecture Explorer...
belt app run google/veo-3-1-fast --input "{\"prompt\": \"Screen recording style interface showing modern web application, clean UI with dark theme, neon accent colors, smooth animations, professional software demo\"}"

echo.
echo Generating Scene 4: Learning Path...
belt app run google/veo-3-1-fast --input "{\"prompt\": \"Animated learning path visualization, modules appearing step by step with time estimates, clean modern UI, dark theme with blue accents\"}"

echo.
echo Generating Scene 5: First PR...
belt app run google/veo-3-1-fast --input "{\"prompt\": \"Developer creating first pull request, GitHub interface, green checkmarks appearing, success celebration, modern office environment\"}"

echo.
echo Generating Scene 6: Q&A Demo...
belt app run google/veo-3-1-fast --input "{\"prompt\": \"AI chat interface answering code questions, streaming text response, file references highlighted, modern dark UI\"}"

echo.
echo Generating Scene 7: Dashboard...
belt app run google/veo-3-1-fast --input "{\"prompt\": \"CTO dashboard with charts and graphs updating, team analytics, completion rates, modern data visualization, dark theme\"}"

echo.
echo Generating Scene 8: Impact...
belt app run google/veo-3-1-fast --input "{\"prompt\": \"Before and after comparison, developer celebration, team high-fiving, bright modern office, confetti falling, photorealistic\"}"

echo.
echo Generating Scene 9: CTA...
belt app run google/veo-3-1-fast --input "{\"prompt\": \"CodeFlow logo centered on dark background, professional tech branding, clean minimal design\"}"

echo.
echo ========================================
echo All clips generated in codeflow-video-clips\
echo ========================================
echo.
echo To combine clips, install FFmpeg and run:
echo ffmpeg -f concat -safe 0 -i filelist.txt -c copy codeflow-final.mp4
echo.
pause
