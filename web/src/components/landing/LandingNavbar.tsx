import { Link, useLocation } from 'react-router-dom';

export default function LandingNavbar() {
  const location = useLocation();

  const navLinks = [
    { name: 'Product', path: '/product' },
    { name: 'How it works', path: '/how-it-works' },
    { name: 'Pricing', path: '/pricing' },
    { name: 'Customers', path: '/customers' },
    { name: 'Docs', path: '/docs' }
  ];

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/60 backdrop-blur-md border-b border-black/10 shadow-sm">
      <div className="w-full max-w-[1110px] mx-auto px-6 h-[80px] flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-[6px] hover:opacity-80 transition-opacity">
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
          <span className="font-['Instrument_Serif'] text-[26px] text-[#212121] leading-none mt-1">CodeFlow</span>
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-4 lg:gap-[26px]">
          {navLinks.map((item) => (
            <Link 
              key={item.name} 
              to={item.path} 
              className={`font-['Manrope'] font-medium text-[18px] transition-opacity ${
                location.pathname === item.path 
                  ? 'text-blue-600' 
                  : 'bg-clip-text text-transparent bg-gradient-to-r from-[rgba(37,44,50,0.7)] to-[rgba(55,65,74,0.7)] hover:opacity-80'
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>

        {/* Login/Get Started */}
        <div className="flex items-center gap-4">
          <Link to="/login" className="hidden sm:flex w-[108px] h-[46px] rounded-[12px] bg-white border border-[#dde2e4] items-center justify-center font-['Instrument_Sans'] font-medium text-[18px] text-[#212121] hover:bg-gray-50 transition-colors shadow-sm">
            Login
          </Link>
          
          {/* Mobile menu button */}
          <button className="md:hidden text-[#212121] hover:text-black focus:outline-none">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
