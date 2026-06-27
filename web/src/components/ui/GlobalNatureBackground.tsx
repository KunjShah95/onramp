export default function GlobalNatureBackground({ children }: { children: React.ReactNode }) {
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
