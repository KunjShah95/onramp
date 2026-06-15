import { Link } from 'react-router-dom';
import LandingNavbar from '../components/landing/LandingNavbar';
import Footer from '../components/landing/Footer';

const plans = [
  {
    name: 'Explorer',
    price: 'Free',
    description: 'Perfect for exploring open source repositories.',
    features: ['Up to 3 repos per month', 'Basic AI analysis', 'Community support'],
    cta: 'Start for Free',
    href: '/register',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/mo',
    description: 'For professional developers who need deep insights.',
    features: ['Unlimited public repos', '5 private repos', 'Advanced AST parsing', 'Priority support', 'Export to PDF/Markdown'],
    cta: 'Upgrade to Pro',
    href: '/register',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For teams that need security and scale.',
    features: ['Unlimited private repos', 'SSO & SAML integration', 'Custom LLM models', 'Dedicated success manager', 'On-premise deployment options'],
    cta: 'Contact Sales',
    href: '/contact',
    popular: false,
  }
];

export default function Pricing() {
  return (
    <div className="flex flex-col min-h-screen">
      <LandingNavbar />
      
      <div className="h-24"></div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-16 relative z-10 animate-in fade-in duration-700">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-4xl md:text-6xl font-display font-bold text-white mb-6 tracking-tight drop-shadow-lg">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-gray-300 drop-shadow-md">
            Choose the perfect plan to accelerate your learning and master any codebase in minutes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div 
              key={plan.name} 
              className={`relative flex flex-col p-8 rounded-3xl backdrop-blur-xl border transition-all duration-300 ${
                plan.popular 
                ? 'bg-blue-900/40 border-blue-400 shadow-[0_0_40px_rgba(59,130,246,0.3)] transform md:-translate-y-4' 
                : 'bg-slate-900/40 border-white/10 hover:border-white/30 hover:bg-slate-800/50'
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <span className="bg-blue-500 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg uppercase tracking-wider">
                    Most Popular
                  </span>
                </div>
              )}
              
              <div className="mb-8">
                <h3 className="text-2xl font-semibold text-white mb-2">{plan.name}</h3>
                <p className="text-gray-300 h-12">{plan.description}</p>
              </div>
              
              <div className="mb-8 flex items-baseline text-white">
                <span className="text-5xl font-extrabold tracking-tight">{plan.price}</span>
                {plan.period && <span className="text-xl text-gray-400 ml-1 font-medium">{plan.period}</span>}
              </div>

              <ul className="flex-1 space-y-4 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start">
                    <svg className="h-6 w-6 text-green-400 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-200">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                to={plan.href}
                className={`w-full py-4 px-6 rounded-xl text-center font-semibold text-lg transition-all duration-300 ${
                  plan.popular
                  ? 'bg-gradient-to-r from-blue-500 to-blue-400 text-white shadow-lg hover:shadow-blue-500/50 hover:scale-105'
                  : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
