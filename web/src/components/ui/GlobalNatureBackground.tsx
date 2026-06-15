import { useEffect, useRef } from 'react';

const generateWaterSound = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const bufferSize = audioCtx.sampleRate * 2; // 2 seconds of buffer
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate brown noise for a deep, rushing water sound
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5; // adjust volume
    }

    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
    
    // Lowpass filter for deep, powerful rumble
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 150; // Deep rumble

    // Bandpass for the rushing water mid-frequencies to give it texture
    const bandpass = audioCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 800; // mid-high splash frequencies

    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.25; // High volume for intense feel

    // Mix both filters into the gain node
    noiseSource.connect(lowpass);
    lowpass.connect(gainNode);
    
    noiseSource.connect(bandpass);
    bandpass.connect(gainNode);

    gainNode.connect(audioCtx.destination);
    
    noiseSource.loop = true;
    noiseSource.start();

    return { audioCtx, gainNode };
  } catch (e) {
    console.error("Audio API not supported", e);
    return null;
  }
};

export default function GlobalNatureBackground({ children }: { children: React.ReactNode }) {
  const audioContextRef = useRef<{ audioCtx: AudioContext, gainNode: GainNode } | null>(null);
  const hasInteracted = useRef(false);


  // Handle global background audio
  useEffect(() => {
    const handleInteraction = () => {
      if (!hasInteracted.current) {
        hasInteracted.current = true;
        if (!audioContextRef.current) {
          audioContextRef.current = generateWaterSound();
        } else if (audioContextRef.current.audioCtx.state === 'suspended') {
          audioContextRef.current.audioCtx.resume();
        }
      }
    };

    window.addEventListener('pointerdown', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });

    return () => {
      window.removeEventListener('pointerdown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      if (audioContextRef.current) {
        audioContextRef.current.audioCtx.close();
      }
    };
  }, []);

  // Particle animation has been replaced by the YouTube background.
  // The audio generation logic remains active below.

  return (
    <div className="relative min-h-screen w-full">
      <div className="fixed inset-0 z-[-10] w-full h-full overflow-hidden pointer-events-none bg-black">
        {/* YouTube Video Background (9:16 aspect ratio) */}
        <iframe
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'max(100vw, 56.25vh)',
            height: 'max(177.78vw, 100vh)',
            pointerEvents: 'none',
          }}
          src="https://www.youtube.com/embed/nD4TQtF1baM?autoplay=1&mute=1&controls=0&loop=1&playlist=nD4TQtF1baM&playsinline=1&modestbranding=1&disablekb=1"
          allow="autoplay; encrypted-media"
          frameBorder="0"
          tabIndex={-1}
        ></iframe>
        
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-slate-900/70 z-10"></div>
      </div>
      
      {/* Content wrapper */}
      <div className="relative z-0 min-h-screen">
        {children}
      </div>
    </div>
  );
}
