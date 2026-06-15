import { Link } from 'react-router-dom';
import { useEffect, useRef } from 'react';

export default function Footer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Gentle mist/fog effect for the forest floor
    let particles: { x: number, y: number, radius: number, speedX: number, opacity: number }[] = [];
    
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      initParticles();
    };

    const initParticles = () => {
      particles = [];
      const particleCount = window.innerWidth < 768 ? 20 : 40;
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 40 + 20,
          speedX: Math.random() * 0.5 + 0.1, // Slowly drift right
          opacity: Math.random() * 0.05 + 0.02
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

        p.x += p.speedX;
        
        // Wrap around
        if (p.x - p.radius > canvas.width) {
          p.x = -p.radius;
          p.y = Math.random() * canvas.height;
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
    <footer className="relative min-h-[40vh] flex flex-col justify-end overflow-hidden border-t border-white/10 bg-transparent">
      {/* Gradient overlay for footer to blend into darkness over global background */}
      <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-900/60 to-transparent"></div>
      
      {/* Canvas for mist effect */}
      <div className="absolute inset-0 z-10 pointer-events-none mix-blend-screen filter blur-md">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      <div className="relative z-20 max-w-7xl mx-auto px-4 py-12 w-full flex flex-col items-center">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 w-full max-w-4xl mb-12 border-b border-white/10 pb-12">
          <div>
            <h4 className="text-white font-semibold mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link to="/product" className="hover:text-white transition-colors">Features</Link></li>
              <li><Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
              <li><Link to="/integrations" className="hover:text-white transition-colors">Integrations</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link to="/documentation" className="hover:text-white transition-colors">Documentation</Link></li>
              <li><Link to="/blog" className="hover:text-white transition-colors">Blog</Link></li>
              <li><Link to="/support" className="hover:text-white transition-colors">Support</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link to="/about" className="hover:text-white transition-colors">About</Link></li>
              <li><Link to="/careers" className="hover:text-white transition-colors">Careers</Link></li>
              <li><Link to="/contact" className="hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link></li>
              <li><Link to="/terms" className="hover:text-white transition-colors">Terms</Link></li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between w-full max-w-4xl text-sm text-gray-500">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <div className="flex -space-x-1 grayscale opacity-50">
              <div className="w-4 h-4 bg-white rounded-sm transform rotate-45"></div>
              <div className="w-4 h-4 bg-gray-400 rounded-sm transform rotate-45"></div>
            </div>
            <span className="font-semibold text-gray-400 tracking-tight">closer</span>
          </div>
          <p>© 2026 Closer Inc. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
