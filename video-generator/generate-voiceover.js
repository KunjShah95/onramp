/**
 * Generate voiceover using ElevenLabs TTS
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const OUTPUT_DIR = process.env.OUTPUT_DIR || './output';

// Voiceover scripts for each scene
const VOICEOVER_SCRIPTS = [
  {
    id: 'scene-01-problem',
    text: 'Developer onboarding is broken. New hires take 3 to 6 months to become productive. Documentation is always stale. Knowledge is trapped in senior developers heads. Teams lose 40 percent of engineering time to onboarding inefficiency.'
  },
  {
    id: 'scene-02-solution',
    text: 'Meet CodeFlow. The AI-powered platform that transforms any GitHub repository into an interactive knowledge wiki. Paste a URL. Get instant architecture analysis. Personalized learning paths. Your first PR in days, not months.'
  },
  {
    id: 'scene-03-architecture',
    text: 'Architecture Explorer. Paste any repo URL. Get a complete dependency graph, module overview, and architecture pattern in seconds. See how everything connects.'
  },
  {
    id: 'scene-04-learning',
    text: 'Learning Path Generator. Tell it your experience level. Get a personalized roadmap with files to read, time estimates, and clear objectives. From beginner to contributor in weeks.'
  },
  {
    id: 'scene-05-first-pr',
    text: 'First PR Accelerator. Find beginner-friendly issues scored by complexity. Get step-by-step guides. Submit your first PR with confidence.'
  },
  {
    id: 'scene-06-qa',
    text: 'Repository Q and A. Ask any question about the codebase. Get answers with file references. Chat naturally with your code.'
  },
  {
    id: 'scene-07-dashboard',
    text: 'But thats just the beginning. CTO dashboards track team progress. Playbooks capture institutional knowledge. Task management guides developers through onboarding. Role-based access control keeps everything secure.'
  },
  {
    id: 'scene-08-impact',
    text: 'The results speak for themselves. Onboarding time reduced from months to weeks. First PRs in days. Teams shipping faster. Developers contributing sooner.'
  },
  {
    id: 'scene-09-cta',
    text: 'Ready to transform your onboarding? Start free today at codeflow dot dev. No credit card required. Your first analysis is on us.'
  }
];

/**
 * Generate voiceover for a single scene
 */
async function generateVoiceover(scene) {
  if (!ELEVENLABS_API_KEY) {
    console.log(`[SKIP] ${scene.id} - No ELEVENLABS_API_KEY set`);
    return null;
  }

  console.log(`[GENERATING] ${scene.id}...`);

  try {
    // First, get available voices
    const voicesResponse = await axios.get(
      'https://api.elevenlabs.io/v1/voices',
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY
        }
      }
    );

    // Use first available voice (or specify a voice ID)
    const voiceId = voicesResponse.data.voices[0]?.voice_id;
    
    if (!voiceId) {
      throw new Error('No voices available');
    }

    // Generate speech
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: scene.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3
        }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        responseType: 'arraybuffer'
      }
    );

    // Save audio file
    const outputPath = path.join(OUTPUT_DIR, `${scene.id}-voiceover.mp3`);
    await fs.writeFile(outputPath, Buffer.from(response.data));
    
    console.log(`[DONE] ${scene.id} -> ${outputPath}`);
    return outputPath;

  } catch (error) {
    console.error(`[ERROR] ${scene.id}:`, error.message);
    return null;
  }
}

/**
 * Combine voiceover with video
 */
async function combineWithVideo(videoPath, audioPath, outputPath) {
  const ffmpeg = await import('fluent-ffmpeg');
  const ffmpegStatic = await import('ffmpeg-static');
  
  ffmpeg.default.setFfmpegPath(ffmpegStatic.default);

  return new Promise((resolve, reject) => {
    ffmpeg.default()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        '-c:v copy',
        '-c:a aac',
        '-map 0:v',
        '-map 1:a',
        '-shortest'
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

/**
 * Main function
 */
async function main() {
  console.log('========================================');
  console.log('CodeFlow Voiceover Generator');
  console.log('========================================\n');

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Check for API key
  if (!ELEVENLABS_API_KEY) {
    console.log('No ELEVENLABS_API_KEY found.');
    console.log('Set ELEVENLABS_API_KEY in .env for voiceover generation.\n');
    console.log('Generating voiceover scripts only...\n');
  }

  // Generate voiceovers
  const results = [];
  for (const scene of VOICEOVER_SCRIPTS) {
    const result = await generateVoiceover(scene);
    results.push({ scene, result });
  }

  // Summary
  console.log('\n========================================');
  console.log('Voiceover Generation Summary');
  console.log('========================================');
  
  const successful = results.filter(r => r.result).length;
  console.log(`Generated: ${successful}/${VOICEOVER_SCRIPTS.length} voiceovers`);
  console.log(`Output directory: ${OUTPUT_DIR}`);

  // Save scripts to file
  const scriptsPath = path.join(OUTPUT_DIR, 'voiceover-scripts.json');
  await fs.writeFile(scriptsPath, JSON.stringify(VOICEOVER_SCRIPTS, null, 2));
  console.log(`\nVoiceover scripts saved to: ${scriptsPath}`);
}

main().catch(console.error);
