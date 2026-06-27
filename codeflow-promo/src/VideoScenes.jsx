import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

// Scene 1: Problem
const ProblemScene = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  const scale = spring({ frame, fps: 30, from: 0.8, to: 1 });
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity, transform: `scale(${scale})`, textAlign: 'center' }}>
        <div style={{ fontSize: 120, marginBottom: 20 }}>😰</div>
        <h1 style={{ color: '#fff', fontSize: 64, fontFamily: 'Arial', fontWeight: 900 }}>
          Codebases are overwhelming
        </h1>
        <p style={{ color: '#888', fontSize: 32, fontFamily: 'Arial', marginTop: 20 }}>
          New developers struggle to onboard
        </p>
      </div>
    </AbsoluteFill>
  );
};

// Scene 2: Solution
const SolutionScene = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  const glow = interpolate(frame, [0, 60], [0, 20]);
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#0d1117', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity, textAlign: 'center' }}>
        <div style={{ 
          fontSize: 120, 
          marginBottom: 20,
          filter: `drop-shadow(0 0 ${glow}px #58a6ff)`,
          color: '#58a6ff'
        }}>
          ⚡
        </div>
        <h1 style={{ color: '#fff', fontSize: 64, fontFamily: 'Arial', fontWeight: 900 }}>
          Meet CodeFlow
        </h1>
        <p style={{ color: '#58a6ff', fontSize: 32, fontFamily: 'Arial', marginTop: 20 }}>
          AI-Powered Code Intelligence
        </p>
      </div>
    </AbsoluteFill>
  );
};

// Scene 3: Architecture
const ArchitectureScene = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  const slideX = spring({ frame, fps: 30, from: 100, to: 0 });
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#161b22', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity, transform: `translateX(${slideX}px)` }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: 20,
          padding: 40
        }}>
          {['Architecture', 'Explorer', 'AI', 'Security', 'Agents', 'Wiki'].map((item, i) => (
            <div key={i} style={{
              background: 'linear-gradient(135deg, #21262d, #30363d)',
              padding: 30,
              borderRadius: 12,
              border: '1px solid #30363d',
              textAlign: 'center'
            }}>
              <div style={{ color: '#58a6ff', fontSize: 24, fontFamily: 'Arial', fontWeight: 600 }}>{item}</div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 4: Learning
const LearningScene = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  const progress = interpolate(frame, [0, 90], [0, 100]);
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#0d1117', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity, width: 800 }}>
        <h1 style={{ color: '#fff', fontSize: 48, fontFamily: 'Arial', marginBottom: 40 }}>
          15-Minute Learning Path
        </h1>
        {['Day 1: Architecture', 'Day 2: First PR', 'Day 3: Testing'].map((step, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 20,
            opacity: interpolate(frame, [i * 20, i * 20 + 30], [0, 1])
          }}>
            <div style={{ 
              width: 50, 
              height: 50, 
              borderRadius: '50%', 
              background: i < 2 ? '#238636' : '#30363d',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              marginRight: 20
            }}>
              {i < 2 ? '✓' : (i + 1)}
            </div>
            <div style={{ color: '#fff', fontSize: 28, fontFamily: 'Arial' }}>{step}</div>
          </div>
        ))}
        <div style={{
          width: '100%',
          height: 8,
          background: '#21262d',
          borderRadius: 4,
          marginTop: 40,
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #238636, #58a6ff)',
            borderRadius: 4
          }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 5: First PR
const FirstPRScene = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  const confettiOpacity = interpolate(frame, [40, 60], [0, 1]);
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#0d1117', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity, textAlign: 'center' }}>
        <div style={{ 
          background: '#21262d', 
          padding: 40, 
          borderRadius: 12,
          border: '1px solid #30363d',
          maxWidth: 600
        }}>
          <div style={{ color: '#238636', fontSize: 48, marginBottom: 20 }}>✓</div>
          <h2 style={{ color: '#fff', fontSize: 36, fontFamily: 'Arial' }}>First PR Merged!</h2>
          <p style={{ color: '#8b949e', fontSize: 24, fontFamily: 'Arial', marginTop: 10 }}>
            Pull Request #42 — Welcome to the team!
          </p>
        </div>
        <div style={{ 
          opacity: confettiOpacity, 
          fontSize: 80, 
          marginTop: 40 
        }}>
          🎉
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 6: Q&A
const QAScene = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  const textWidth = interpolate(frame, [20, 80], [0, 100]);
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#0d1117', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity, width: 800 }}>
        <div style={{ 
          background: '#161b22', 
          padding: 30, 
          borderRadius: 12,
          border: '1px solid #30363d'
        }}>
          <div style={{ color: '#8b949e', fontSize: 20, fontFamily: 'monospace', marginBottom: 10 }}>
            Q: What does the auth module do?
          </div>
          <div style={{ 
            color: '#58a6ff', 
            fontSize: 20, 
            fontFamily: 'monospace',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            width: `${textWidth}%`
          }}>
            A: The auth module handles JWT tokens, OAuth2 flows, and session management...
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 7: Dashboard
const DashboardScene = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  
  const bars = [70, 85, 45, 92, 60, 78, 55, 88];
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#0d1117', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity }}>
        <h1 style={{ color: '#fff', fontSize: 48, fontFamily: 'Arial', marginBottom: 40 }}>
          Team Dashboard
        </h1>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', height: 300 }}>
          {bars.map((height, i) => (
            <div key={i} style={{
              width: 60,
              height: interpolate(frame, [i * 5, i * 5 + 30], [0, height * 2]),
              background: `linear-gradient(180deg, #58a6ff, #238636)`,
              borderRadius: 4
            }} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 8: Impact
const ImpactScene = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  const scale = spring({ frame, fps: 30, from: 0.5, to: 1 });
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#0d1117', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity, transform: `scale(${scale})`, textAlign: 'center' }}>
        <h1 style={{ color: '#fff', fontSize: 72, fontFamily: 'Arial', fontWeight: 900 }}>
          The Impact
        </h1>
        <div style={{ display: 'flex', gap: 80, marginTop: 60 }}>
          {[
            { value: '15min', label: 'Onboarding' },
            { value: '70%', label: 'Faster' },
            { value: '100%', label: 'Secure' }
          ].map((stat, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ color: '#58a6ff', fontSize: 64, fontFamily: 'Arial', fontWeight: 900 }}>
                {stat.value}
              </div>
              <div style={{ color: '#8b949e', fontSize: 24, fontFamily: 'Arial', marginTop: 10 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 9: CTA
const CTAScene = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  const pulse = interpolate(frame, [0, 30, 60], [1, 1.05, 1]);
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity, transform: `scale(${pulse})`, textAlign: 'center' }}>
        <h1 style={{ 
          color: '#58a6ff', 
          fontSize: 96, 
          fontFamily: 'Arial', 
          fontWeight: 900,
          textShadow: '0 0 40px #58a6ff'
        }}>
          CodeFlow
        </h1>
        <p style={{ color: '#fff', fontSize: 36, fontFamily: 'Arial', marginTop: 20 }}>
          AI-Powered Code Intelligence
        </p>
        <div style={{ 
          marginTop: 60, 
          padding: '20px 60px', 
          background: '#238636', 
          borderRadius: 12,
          color: '#fff',
          fontSize: 28,
          fontFamily: 'Arial',
          fontWeight: 600
        }}>
          Get Started Free
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const VideoScenes = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={300}>
        <ProblemScene />
      </Sequence>
      <Sequence from={300} durationInFrames={300}>
        <SolutionScene />
      </Sequence>
      <Sequence from={600} durationInFrames={300}>
        <ArchitectureScene />
      </Sequence>
      <Sequence from={900} durationInFrames={300}>
        <LearningScene />
      </Sequence>
      <Sequence from={1200} durationInFrames={300}>
        <FirstPRScene />
      </Sequence>
      <Sequence from={1500} durationInFrames={300}>
        <QAScene />
      </Sequence>
      <Sequence from={1800} durationInFrames={300}>
        <DashboardScene />
      </Sequence>
      <Sequence from={2100} durationInFrames={300}>
        <ImpactScene />
      </Sequence>
      <Sequence from={2400} durationInFrames={300}>
        <CTAScene />
      </Sequence>
    </AbsoluteFill>
  );
};
