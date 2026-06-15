import { useEffect, useRef } from 'react';

const steps = [
  { num: '01', title: 'Paste a Repository', desc: 'Drop any GitHub URL — public or private. We clone and index.' },
  { num: '02', title: 'AI Analyzes', desc: 'AST parsing + LLM insights extract architecture, patterns, and intent.' },
  { num: '03', title: 'Get Your Wiki', desc: 'Personalized learning path, first-PR guide, and Q&A over the codebase.' },
]

export default function HowItWorks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fireflies effect for the lake
    let particles: { x: number, y: number, radius: number, speedX: number, speedY: number, opacity: number, pulseRate: number, pulseOffset: number }[] = [];
    
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      initParticles();
    };

    const initParticles = () => {
      particles = [];
      const particleCount = window.innerWidth < 768 ? 30 : 60;
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 2 + 1.5,
          speedX: (Math.random() - 0.5) * 0.5,
          speedY: (Math.random() - 0.5) * 0.5,
          opacity: Math.random() * 0.5 + 0.3,
          pulseRate: Math.random() * 0.05 + 0.01,
          pulseOffset: Math.random() * Math.PI * 2
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        // Calculate pulsating opacity
        const currentOpacity = p.opacity + Math.sin(Date.now() * p.pulseRate + p.pulseOffset) * 0.3;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 255, 200, ${Math.max(0.1, currentOpacity)})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(150, 255, 150, 0.8)';
        ctx.fill();
        ctx.shadowBlur = 0; // reset

        p.y += p.speedY;
        p.x += p.speedX;
        
        // Bounce off edges smoothly
        if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
        if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
      });

      requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resize);
    resize();
    draw();

    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <section className="relative min-h-[80vh] flex flex-col justify-center overflow-hidden bg-transparent">
      {/* Dark overlay with slight green tint to blend nicely */}
      <div className="absolute inset-0 bg-slate-900/40"></div>
      
      {/* Canvas for fireflies effect */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      <div className="relative z-20 max-w-3xl mx-auto px-4 py-24 w-full">
        <h2 className="text-3xl md:text-5xl font-medium text-white text-center mb-16 tracking-tight">How It Works</h2>
        <div className="space-y-10 relative">
          {/* Vertical line connecting steps */}
          <div className="absolute left-8 md:left-12 top-10 bottom-10 w-px bg-gradient-to-b from-green-400/50 via-blue-400/50 to-transparent hidden md:block"></div>
          
          {steps.map((step) => (
            <div key={step.num} className="relative flex flex-col md:flex-row gap-6 md:gap-12 items-start group">
              <div className="flex-shrink-0 w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center font-display text-xl font-semibold text-green-300 shadow-[0_0_20px_rgba(74,222,128,0.2)] group-hover:scale-110 group-hover:bg-white/20 group-hover:shadow-[0_0_30px_rgba(74,222,128,0.4)] transition-all duration-300 z-10">
                {step.num}
              </div>
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 md:p-8 flex-1 group-hover:bg-white/10 transition-colors">
                <h3 className="text-xl md:text-2xl font-semibold text-white mb-3">{step.title}</h3>
                <p className="text-gray-300 text-base leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
