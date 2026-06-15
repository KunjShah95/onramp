import { useEffect, useRef } from 'react';

const features = [
  { icon: '◈', title: 'Architecture Explorer', desc: 'Visualize any repo structure' },
  { icon: '◈', title: 'Learning Path', desc: 'Personalized onboarding modules' },
  { icon: '◈', title: 'First PR', desc: 'Find issues, generate step-by-step' },
  { icon: '◈', title: 'Repo Q&A', desc: 'Ask questions over any codebase' },
]

export default function Features() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: { x: number, y: number, radius: number, speedX: number, speedY: number, opacity: number }[] = [];
    
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      initParticles();
    };

    const initParticles = () => {
      particles = [];
      const particleCount = window.innerWidth < 768 ? 40 : 100;
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 2 + 1,
          speedX: (Math.random() - 0.5) * 1,
          speedY: Math.random() * 2 + 1,
          opacity: Math.random() * 0.5 + 0.1
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
        ctx.fill();

        p.y += p.speedY;
        p.x += p.speedX;
        
        // Reset particle when it goes off screen
        if (p.y > canvas.height) {
          p.y = -10;
          p.x = Math.random() * canvas.width;
        }
      });

      requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resize);
    resize();
    draw();

    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <section className="relative min-h-[70vh] flex flex-col justify-center overflow-hidden bg-transparent">
      {/* Dark overlay to make text readable over global background */}
      <div className="absolute inset-0 bg-slate-900/50"></div>
      
      {/* Canvas for floating river water droplets */}
      <div className="absolute inset-0 z-10 opacity-60 mix-blend-screen pointer-events-none">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      <div className="relative z-20 max-w-5xl mx-auto px-4 py-24 w-full">
        <h2 className="text-3xl md:text-5xl font-medium text-white text-center mb-16 tracking-tight">Powerful Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {features.map((f) => (
            <div key={f.title} className="group cursor-default bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-1 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
              <div className="w-12 h-12 rounded-xl bg-blue-400/20 flex items-center justify-center text-blue-300 text-xl mb-6 group-hover:bg-blue-400/40 group-hover:scale-110 transition-all">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
