/**
 * Preview video scenes with ASCII art
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCENES = [
  {
    id: 'scene-01-problem',
    name: 'The Problem',
    duration: '0:00 - 0:25',
    icon: '😰',
    description: 'Frustrated developer, complex code, dark office'
  },
  {
    id: 'scene-02-solution',
    name: 'The Solution',
    duration: '0:25 - 0:50',
    icon: '✨',
    description: 'CodeFlow logo, holographic interface, network graph'
  },
  {
    id: 'scene-03-architecture',
    name: 'Architecture Explorer',
    duration: '0:50 - 1:00',
    icon: '🏗️',
    description: 'Force-directed graph, module analysis, dark UI'
  },
  {
    id: 'scene-04-learning',
    name: 'Learning Path',
    duration: '1:00 - 1:10',
    icon: '📚',
    description: 'Learning modules, time estimates, step by step'
  },
  {
    id: 'scene-05-first-pr',
    name: 'First PR',
    duration: '1:10 - 1:20',
    icon: '🎯',
    description: 'GitHub PR, green checkmarks, celebration'
  },
  {
    id: 'scene-06-qa',
    name: 'Q&A Demo',
    duration: '1:20 - 1:30',
    icon: '💬',
    description: 'AI chat, streaming response, file references'
  },
  {
    id: 'scene-07-dashboard',
    name: 'Dashboard',
    duration: '1:30 - 1:50',
    icon: '📊',
    description: 'CTO dashboard, charts, team analytics'
  },
  {
    id: 'scene-08-impact',
    name: 'Impact',
    duration: '2:10 - 2:25',
    icon: '🎉',
    description: 'Before/after, celebration, confetti'
  },
  {
    id: 'scene-09-cta',
    name: 'CTA',
    duration: '2:25 - 2:40',
    icon: '🚀',
    description: 'Logo, URL, call to action'
  }
];

async function preview() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           CodeFlow Video - Scene Preview                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  for (const scene of SCENES) {
    console.log(`  ${scene.icon} ${scene.name}`);
    console.log(`  ├─ Duration: ${scene.duration}`);
    console.log(`  ├─ Description: ${scene.description}`);
    console.log(`  └─ File: ${scene.id}.mp4`);
    console.log('');
  }

  console.log('══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Total Duration: ~2:40 minutes');
  console.log('  Resolution: 1920x1080 (16:9)');
  console.log('  FPS: 30');
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');

  // ASCII timeline
  console.log('  Timeline:');
  console.log('  ┌─────────────────────────────────────────────────────────┐');
  
  const timelineWidth = 50;
  const segmentWidth = Math.floor(timelineWidth / SCENES.length);
  
  let timeline = '  │';
  for (let i = 0; i < SCENES.length; i++) {
    timeline += '█'.repeat(segmentWidth);
  }
  timeline += '│';
  console.log(timeline);
  
  console.log('  └─────────────────────────────────────────────────────────┘');
  console.log('  0:00                                              2:40');
  console.log('');
}

preview().catch(console.error);
