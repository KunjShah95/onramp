import { useLocation } from 'react-router-dom';
import LandingNavbar from '../components/landing/LandingNavbar';
import Footer from '../components/landing/Footer';

export default function GenericContentPage({ title }: { title?: string }) {
  const location = useLocation();
  
  // Extract title from pathname if not provided (e.g. /privacy -> Privacy)
  const displayTitle = title || location.pathname.split('/')[1].charAt(0).toUpperCase() + location.pathname.split('/')[1].slice(1);

  return (
    <div className="flex flex-col min-h-screen">
      <LandingNavbar />
      
      {/* Spacer for fixed navbar */}
      <div className="h-24"></div>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-12 relative z-10 animate-in fade-in duration-700">
        <div className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-2xl p-8 md:p-12 shadow-2xl">
          <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-8 tracking-tight drop-shadow-md">
            {displayTitle}
          </h1>
          
          <div className="prose prose-invert max-w-none prose-lg">
            <p className="text-gray-300 leading-relaxed mb-6">
              Welcome to the {displayTitle} page. This section of CodeFlow is currently under active development. 
              Our team is working hard to bring you comprehensive documentation, rich features, and detailed policies 
              that reflect our commitment to excellence.
            </p>
            
            <h2 className="text-2xl font-semibold text-white mt-10 mb-4 border-b border-white/10 pb-2">What to Expect</h2>
            <ul className="list-disc pl-6 space-y-3 text-gray-300">
              <li>Detailed insights and clear, concise information.</li>
              <li>Immersive, fluid designs inspired by nature.</li>
              <li>A focus on user experience and robust architecture.</li>
            </ul>

            <h2 className="text-2xl font-semibold text-white mt-10 mb-4 border-b border-white/10 pb-2">Get in Touch</h2>
            <p className="text-gray-300 leading-relaxed mb-6">
              If you have any urgent questions regarding this page or our platform, please do not hesitate to reach out to our support team.
              We are always here to help you navigate your journey with CodeFlow.
            </p>
            
            <div className="mt-12 p-6 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
              <p className="text-blue-200 font-medium">
                Check back soon for updates!
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
