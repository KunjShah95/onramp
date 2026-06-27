/**
 * Complete video generation pipeline
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

const OUTPUT_DIR = './output';

async function runCommand(command, description) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${description}`);
  console.log('='.repeat(60));
  
  try {
    const { stdout, stderr } = await execAsync(command, { 
      cwd: __dirname,
      timeout: 600000 // 10 minutes
    });
    
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    
    return true;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       CodeFlow Video - Complete Generation Pipeline        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Step 1: Preview
  await runCommand('node preview-video.js', 'Step 1: Preview Video Scenes');

  // Step 2: Generate voiceover scripts
  await runCommand('node generate-voiceover.js', 'Step 2: Generate Voiceover Scripts');

  // Step 3: Generate video clips
  await runCommand('node generate-video.js', 'Step 3: Generate Video Clips');

  // Step 4: Combine clips
  await runCommand('node combine-clips.js', 'Step 4: Combine Video Clips');

  // Final summary
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Generation Complete!                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  
  try {
    const files = await fs.readdir(path.join(__dirname, OUTPUT_DIR));
    const videoFiles = files.filter(f => f.endsWith('.mp4'));
    
    console.log('  Output files:');
    for (const file of videoFiles) {
      const stats = await fs.stat(path.join(__dirname, OUTPUT_DIR, file));
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`    - ${file} (${sizeMB} MB)`);
    }
    
    console.log('');
    console.log('  Final video: output/codeflow-final.mp4');
    console.log('');
    
  } catch (error) {
    console.log('  Check output/ directory for generated files');
  }
  
  console.log('════════════════════════════════════════════════════════════════');
  console.log('');
}

main().catch(console.error);
