import Spotlight from '../ui/spotlight'
import Vortex from '../ui/vortex'
import { Link } from 'react-router-dom'

export default function Hero() {
  return (
    <Vortex className="relative min-h-[90vh] flex items-center justify-center" opacity={0.12}>
      <Spotlight className="top-[-40%] left-0" />
      <div className="relative z-10 text-center max-w-3xl mx-auto px-4">
        <h1 className="font-display text-5xl md:text-7xl font-bold text-text-primary leading-tight">
          Turn Any GitHub Repo
          <br />
          Into a Developer Wiki
        </h1>
        <p className="mt-4 text-lg text-text-secondary font-body max-w-xl mx-auto">
          Analyze. Learn. Ship faster.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Paste a GitHub repository URL..."
              className="input"
            />
          </div>
          <Link to="/explore" className="btn whitespace-nowrap">
            Analyze
          </Link>
        </div>
      </div>
    </Vortex>
  )
}
