/**
 * Combine video clips using FFmpeg
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = process.env.OUTPUT_DIR || './output';
const OUTPUT_FILE = 'codeflow-final.mp4';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

const SCENES = [
  'scene-01-problem',
  'scene-02-solution',
  'scene-03-architecture',
  'scene-04-learning',
  'scene-05-first-pr',
  'scene-06-qa',
  'scene-07-dashboard',
  'scene-08-impact',
  'scene-09-cta'
];

async function combineClips() {
  console.log('========================================');
  console.log('Combining Video Clips');
  console.log('========================================\n');

  // Check if FFmpeg is available
  if (!ffmpegStatic) {
    console.error('FFmpeg not found. Install ffmpeg-static:');
    console.error('npm install ffmpeg-static');
    process.exit(1);
  }

  // Check for input files
  const inputFiles = [];
  for (const scene of SCENES) {
    const filePath = path.join(OUTPUT_DIR, `${scene}.mp4`);
    try {
      await fs.access(filePath);
      inputFiles.push(filePath);
    } catch {
      console.log(`[SKIP] ${scene}.mp4 not found`);
    }
  }

  if (inputFiles.length === 0) {
    console.error('No video files found in', OUTPUT_DIR);
    console.error('Run "npm run generate" first');
    process.exit(1);
  }

  console.log(`Found ${inputFiles.length} video files`);

  // Create concat file
  const concatFile = path.join(OUTPUT_DIR, 'concat.txt');
  const concatContent = inputFiles
    .map(file => `file '${file}'`)
    .join('\n');
  
  await fs.writeFile(concatFile, concatContent);
  console.log('Created concat file');

  // Combine with FFmpeg
  const outputPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
  
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions([
        '-c:v libx264',
        '-crf 23',
        '-preset medium',
        '-c:a aac',
        '-b:a 192k'
      ])
      .output(outputPath)
      .on('start', (command) => {
        console.log('\nRunning FFmpeg...');
        console.log(command);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\rProgress: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        console.log('\n\n[DONE] Video combined successfully!');
        console.log(`Output: ${outputPath}`);
        resolve();
      })
      .on('error', (err) => {
        console.error('\n[ERROR]', err.message);
        reject(err);
      })
      .run();
  });
}

combineClips().catch(console.error);
