/**
 * CodeFlow Video Generator
 * Generates promotional video clips using inference.sh API
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const OUTPUT_DIR = process.env.OUTPUT_DIR || './output';
const API_KEY = process.env.INFSH_API_KEY;
const API_BASE = 'https://api.inference.sh';

// Video scenes configuration
const SCENES = [
  {
    id: 'scene-01-problem',
    name: 'The Problem',
    duration: '0:00 - 0:25',
    prompt: 'Cinematic shot of frustrated software developer staring at multiple monitors filled with complex code, dark office lighting, rain on windows, photorealistic, 4K, slow motion',
    model: 'google/veo-3-1-fast'
  },
  {
    id: 'scene-02-solution',
    name: 'The Solution',
    duration: '0:25 - 0:50',
    prompt: 'Futuristic holographic interface showing code analysis, glowing blue nodes connecting in a network graph, dark background with particle effects, tech aesthetic, 4K',
    model: 'google/veo-3-1-fast'
  },
  {
    id: 'scene-03-architecture',
    name: 'Architecture Explorer',
    duration: '0:50 - 1:00',
    prompt: 'Screen recording style interface showing modern web application, clean UI with dark theme, neon accent colors, smooth animations, professional software demo',
    model: 'google/veo-3-1-fast'
  },
  {
    id: 'scene-04-learning',
    name: 'Learning Path',
    duration: '1:00 - 1:10',
    prompt: 'Animated learning path visualization, modules appearing step by step with time estimates, clean modern UI, dark theme with blue accents',
    model: 'google/veo-3-1-fast'
  },
  {
    id: 'scene-05-first-pr',
    name: 'First PR',
    duration: '1:10 - 1:20',
    prompt: 'Developer creating first pull request, GitHub interface, green checkmarks appearing, success celebration, modern office environment',
    model: 'google/veo-3-1-fast'
  },
  {
    id: 'scene-06-qa',
    name: 'Q&A Demo',
    duration: '1:20 - 1:30',
    prompt: 'AI chat interface answering code questions, streaming text response, file references highlighted, modern dark UI',
    model: 'google/veo-3-1-fast'
  },
  {
    id: 'scene-07-dashboard',
    name: 'Dashboard',
    duration: '1:30 - 1:50',
    prompt: 'CTO dashboard with charts and graphs updating, team analytics, completion rates, modern data visualization, dark theme',
    model: 'google/veo-3-1-fast'
  },
  {
    id: 'scene-08-impact',
    name: 'Impact',
    duration: '2:10 - 2:25',
    prompt: 'Before and after comparison, developer celebration, team high-fiving, bright modern office, confetti falling, photorealistic',
    model: 'google/veo-3-1-fast'
  },
  {
    id: 'scene-09-cta',
    name: 'CTA',
    duration: '2:25 - 2:40',
    prompt: 'CodeFlow logo centered on dark background, professional tech branding, clean minimal design',
    model: 'google/veo-3-1-fast'
  }
];

/**
 * Generate video using inference.sh REST API
 */
async function generateWithAPI(scene) {
  if (!API_KEY) {
    console.log(`[SKIP] ${scene.name} - No INFSH_API_KEY set`);
    return null;
  }

  console.log(`[GENERATING] ${scene.name}...`);
  
  try {
    // Run the app
    const response = await axios.post(
      `${API_BASE}/apps/run`,
      {
        app: scene.model,
        input: { prompt: scene.prompt }
      },
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'X-API-Version': '2'
        },
        timeout: 300000 // 5 minutes timeout
      }
    );

    console.log(`[RESPONSE] ${scene.name}:`, JSON.stringify(response.data).substring(0, 200));

    if (response.data && response.data.task_id) {
      // Poll for completion
      const taskId = response.data.task_id;
      console.log(`[TASK] ${scene.name}: Task ID ${taskId}`);
      
      const result = await pollTask(taskId);
      if (result && result.output) {
        const outputPath = path.join(OUTPUT_DIR, `${scene.id}.mp4`);
        await downloadVideo(result.output.url || result.output, outputPath);
        console.log(`[DONE] ${scene.name} -> ${outputPath}`);
        return outputPath;
      }
    } else if (response.data && response.data.output) {
      const outputPath = path.join(OUTPUT_DIR, `${scene.id}.mp4`);
      await downloadVideo(response.data.output.url || response.data.output, outputPath);
      console.log(`[DONE] ${scene.name} -> ${outputPath}`);
      return outputPath;
    }
  } catch (error) {
    console.error(`[ERROR] ${scene.name}:`, error.response?.data || error.message);
    return null;
  }
}

/**
 * Poll task status
 */
async function pollTask(taskId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(
        `${API_BASE}/tasks/${taskId}`,
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'X-API-Version': '2'
          }
        }
      );

      const status = response.data.status;
      console.log(`[POLL] Task ${taskId}: ${status}`);

      if (status === 'completed') {
        return response.data;
      } else if (status === 'failed') {
        throw new Error(`Task failed: ${response.data.error}`);
      }

      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      console.error(`[POLL ERROR]`, error.message);
      throw error;
    }
  }
  throw new Error('Task timed out');
}

/**
 * Download video from URL
 */
async function downloadVideo(url, outputPath) {
  if (typeof url === 'string' && url.startsWith('http')) {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } else {
    // If it's base64 or other format
    console.log('[DOWNLOAD] Output:', JSON.stringify(url).substring(0, 200));
    return null;
  }
}

/**
 * Generate placeholder scene (for demo without API)
 */
async function generatePlaceholder(scene) {
  const outputPath = path.join(OUTPUT_DIR, `${scene.id}.txt`);
  
  const content = `Scene: ${scene.name}
Duration: ${scene.duration}
Prompt: ${scene.prompt}
Model: ${scene.model}
Status: Placeholder (API key required for actual generation)
`;
  
  await fs.writeFile(outputPath, content);
  console.log(`[PLACEHOLDER] ${scene.name} -> ${outputPath}`);
  return outputPath;
}

/**
 * Main generation function
 */
async function main() {
  console.log('========================================');
  console.log('CodeFlow Video Generator');
  console.log('========================================\n');

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Check for API key
  const hasAPI = !!API_KEY;
  
  if (!hasAPI) {
    console.log('No API key found. Generating placeholders...');
    console.log('Set INFSH_API_KEY in .env for actual video generation.\n');
  } else {
    console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
  }

  const results = [];

  for (const scene of SCENES) {
    let result;
    
    if (hasAPI) {
      result = await generateWithAPI(scene);
    } else {
      result = await generatePlaceholder(scene);
    }
    
    results.push({ scene, result });
  }

  // Summary
  console.log('\n========================================');
  console.log('Generation Summary');
  console.log('========================================');
  
  const successful = results.filter(r => r.result).length;
  console.log(`Generated: ${successful}/${SCENES.length} scenes`);
  console.log(`Output directory: ${OUTPUT_DIR}`);

  // Create file list for FFmpeg
  await createFileList();
  
  console.log('\nTo combine clips, run:');
  console.log('npm run combine');
}

/**
 * Create FFmpeg file list
 */
async function createFileList() {
  const fileList = SCENES
    .map(scene => `file '${scene.id}.mp4'`)
    .join('\n');
  
  const filePath = path.join(OUTPUT_DIR, 'filelist.txt');
  await fs.writeFile(filePath, fileList);
  console.log(`\nCreated FFmpeg file list: ${filePath}`);
}

main().catch(console.error);
