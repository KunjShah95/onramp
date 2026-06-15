import { Link } from 'react-router-dom';

export default function AnimatedHero() {

  return (
    <div className="relative h-screen w-full overflow-hidden">
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
      <div className="absolute inset-0 bg-slate-900/40 z-0 pointer-events-none"></div>

      {/* Navigation Bar */}
      <nav className="absolute top-[20px] left-1/2 -translate-x-1/2 w-full max-w-[1110px] px-6 z-20 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-[6px]">
          <svg width="23" height="23" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="11.5" cy="11.5" r="11.5" fill="url(#paint0_radial)" />
            <defs>
              <radialGradient id="paint0_radial" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(11.5 11.5) rotate(90) scale(11.5)">
                <stop stopColor="#368CFB" />
                <stop offset="0.3" stopColor="#5CAEFE" />
                <stop offset="1" stopColor="#FFEB85" />
              </radialGradient>
            </defs>
          </svg>
          <span className="font-['Instrument_Serif'] text-[26px] text-white leading-none mt-1">CodeFlow</span>
        </div>

        {/* Nav Links */}
        <div className="hidden md:flex items-center gap-4 lg:gap-[26px]">
          {[
            { name: 'Product', path: '/product' },
            { name: 'How it works', path: '/how-it-works' },
            { name: 'Pricing', path: '/pricing' },
            { name: 'Customers', path: '/customers' },
            { name: 'Docs', path: '/docs' }
          ].map((item) => (
            <Link key={item.name} to={item.path} className="font-['Manrope'] font-medium text-[18px] text-gray-200 hover:text-white transition-opacity">
              {item.name}
            </Link>
          ))}
        </div>

        {/* Login Button */}
        <button className="w-[108px] h-[46px] rounded-[12px] bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center font-['Instrument_Sans'] font-medium text-[18px] text-white hover:bg-white/20 transition-colors shadow-sm">
          Login
        </button>
      </nav>

      {/* Hero Content */}
      <div 
        className="absolute z-10 w-full max-w-[984px] px-[24px] flex flex-col items-center text-center"
        style={{
          left: '50%',
          top: 'calc(50% - 136.5px)',
          transform: 'translate(-50%, -50%)'
        }}
      >
        <h1 className="font-['Instrument_Serif'] text-white text-[48px] md:text-[70px] leading-[1.1] md:leading-[64px] max-w-[722px] tracking-tight drop-shadow-md">
          Turn any GitHub repo into a{' '}
          <span 
            className="italic font-['Instrument_Serif'] bg-clip-text text-transparent inline-block"
            style={{
              backgroundImage: 'radial-gradient(circle at 50% 50%, #368CFB 0%, #5CAEFE 30%, #85BDE0 47.5%, #AECDC2 65%, #D6DCA3 82.5%, #FFEB85 100%)',
              paddingRight: '0.1em'
            }}
          >
            developer wiki.
          </span>
        </h1>

        <p className="font-['Manrope'] font-normal text-[18px] md:text-[20px] max-w-[510px] tracking-[-0.4px] mt-[24px] md:mt-[32px] text-gray-200 leading-relaxed drop-shadow-sm">
          Analyze your entire codebase in seconds. Learn the architecture, ship faster, and never get lost in undocumented repositories again.
        </p>

        <div className="mt-[32px] md:mt-[48px] flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-[600px] mx-auto">
          <input
            type="text"
            placeholder="Paste a GitHub repository URL..."
            className="w-full sm:w-auto flex-1 h-[52px] px-6 rounded-[12px] bg-white/10 backdrop-blur-md border border-white/20 text-white placeholder-white/60 focus:outline-none focus:border-white/40 transition-colors font-['Manrope'] text-[16px] shadow-sm"
          />
          <Link 
            to="/explore"
            className="w-full sm:w-[152px] h-[52px] rounded-[12px] font-['Instrument_Sans'] font-medium text-[16px] text-white flex items-center justify-center transition-opacity hover:opacity-90 shrink-0"
            style={{
              background: 'linear-gradient(180deg, #444444 0%, #292929 100%)',
              border: '1px solid #000000',
              boxShadow: '0px 4px 4px rgba(0, 0, 0, 0.25), 0px 1px 2px rgba(0, 0, 0, 0.31), inset 0px 2px 1px rgba(255, 255, 255, 0.51), inset 1px 1px 0.25px rgba(255, 255, 255, 0.3)'
            }}
          >
            Analyze Now
          </Link>
        </div>
      </div>
    </div>
  );
}
