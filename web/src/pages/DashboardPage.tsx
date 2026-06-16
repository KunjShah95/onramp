import { useState, useEffect } from 'react'
import { fetchCTODashboard, type CTOResponse } from '../lib/api'

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<CTOResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCTODashboard()
      .then(setDashboard)
      .catch(() => setDashboard(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="animate-in w-full h-full min-h-[calc(100vh-4rem)] bg-white rounded-3xl p-8 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center">
          <svg className="w-8 h-8 animate-spin text-[#FF8C00] mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-[#110D0A]/60 text-sm font-mono animate-pulse">Loading dashboard metrics...</p>
        </div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="animate-in w-full h-full min-h-[calc(100vh-4rem)] bg-white rounded-3xl p-8 flex items-center justify-center text-red-500 font-mono">
        Failed to load dashboard metrics.
      </div>
    )
  }

  return (
    <div className="animate-in w-full h-full min-h-[calc(100vh-4rem)] bg-white rounded-3xl p-8 font-body text-[#110D0A]">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2 text-[#110D0A]">Welcome back, CTO</h1>
        <p className="text-[#110D0A]/60 text-sm">Here is what's happening with your repositories today.</p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="text-sm font-medium text-gray-500">Repos Analyzed</span>
            <span className="material-symbols-outlined text-gray-400 text-sm">folder</span>
          </div>
          <div className="font-display text-3xl font-bold text-[#110D0A]">{dashboard.total_repos}</div>
          <div className="text-xs text-green-500 font-medium mt-2 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">trending_up</span> +2 this week
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="text-sm font-medium text-gray-500">Onboarding Speed</span>
            <span className="material-symbols-outlined text-gray-400 text-sm">speed</span>
          </div>
          <div className="font-display text-3xl font-bold text-[#110D0A]">{dashboard.onboarding_time_saved_hours}h saved</div>
          <div className="text-xs text-green-500 font-medium mt-2 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">trending_up</span> Faster than avg
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="text-sm font-medium text-gray-500">First PRs Merged</span>
            <span className="material-symbols-outlined text-gray-400 text-sm">memory</span>
          </div>
          <div className="font-display text-3xl font-bold text-[#110D0A]">{dashboard.first_prs_merged.toLocaleString()}</div>
          <div className="text-xs text-green-500 font-medium mt-2 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">trending_up</span> Good momentum
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="text-sm font-medium text-gray-500">Active Paths</span>
            <span className="material-symbols-outlined text-gray-400 text-sm">timeline</span>
          </div>
          <div className="font-display text-3xl font-bold text-[#110D0A] flex justify-between items-end">
            {dashboard.learning_paths_generated}
            {/* Tiny bar chart mock */}
            <div className="flex items-end gap-1 h-8">
              <div className="w-1.5 bg-[#FF8C00] rounded-t h-[40%]"></div>
              <div className="w-1.5 bg-[#FF8C00] rounded-t h-[60%]"></div>
              <div className="w-1.5 bg-[#FF8C00] rounded-t h-[30%]"></div>
              <div className="w-1.5 bg-[#FF8C00] rounded-t h-[80%]"></div>
              <div className="w-1.5 bg-[#FF8C00] rounded-t h-[100%]"></div>
              <div className="w-1.5 bg-[#FF8C00] rounded-t h-[50%]"></div>
              <div className="w-1.5 bg-[#FF8C00]/30 rounded-t h-[70%]"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="md:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="font-display text-lg font-bold text-[#110D0A] mb-6">Recent Activity</h2>
          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
            {/* Timeline Item 1 */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-green-100 text-green-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                <span className="material-symbols-outlined text-sm">check</span>
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-gray-100 bg-gray-50 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-bold text-sm text-[#110D0A]">Indexing Complete</h4>
                  <time className="text-xs font-medium text-gray-400">2h ago</time>
                </div>
                <p className="text-sm text-gray-500">CodeFlow 2.0 indexing completed for <span className="font-mono text-xs bg-gray-200 px-1 rounded">nextjs-saas-starter</span></p>
              </div>
            </div>

            {/* Timeline Item 2 */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-blue-100 text-blue-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                <span className="material-symbols-outlined text-sm">route</span>
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-gray-100 bg-gray-50 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-bold text-sm text-[#110D0A]">Learning Path Generated</h4>
                  <time className="text-xs font-medium text-gray-400">5h ago</time>
                </div>
                <p className="text-sm text-gray-500">Learning path generated for the backend engineering team.</p>
              </div>
            </div>

            {/* Timeline Item 3 */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-[#FF8C00]/10 text-[#FF8C00] shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                <span className="material-symbols-outlined text-sm">reviews</span>
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-gray-100 bg-gray-50 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                <h4 className="font-bold text-sm text-[#110D0A]">Architecture Diff Generated</h4>
                <time className="text-xs font-medium text-gray-400">1d ago</time>
              </div>
              <p className="text-sm text-gray-500">Structural changes detected and mapped for PR #124.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Donut Chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col">
          <h2 className="font-display text-lg font-bold text-[#110D0A] mb-6">Repository Health</h2>
          <div className="flex-1 flex flex-col items-center justify-center">
            {/* SVG Donut */}
            <div className="relative w-48 h-48 mb-6">
              <svg viewBox="0 0 100 100" className="transform -rotate-90 w-full h-full drop-shadow-md">
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f3f4f6" strokeWidth="15" />
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#FF8C00" strokeWidth="15" strokeDasharray="251.2" strokeDashoffset="37.68" className="transition-all duration-1000 ease-out-expo" />
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#FFB347" strokeWidth="15" strokeDasharray="251.2" strokeDashoffset="180" className="transition-all duration-1000 ease-out-expo delay-300" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-3xl font-bold text-[#110D0A]">85<span className="text-lg text-gray-400">%</span></span>
                <span className="text-xs text-green-500 font-medium">Healthy</span>
              </div>
            </div>

            {/* Legend */}
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#FF8C00]"></span>
                  <span className="text-gray-600">Clean Code</span>
                </div>
                <span className="font-medium">45%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#FFB347]"></span>
                  <span className="text-gray-600">Tech Debt</span>
                </div>
                <span className="font-medium">25%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-gray-200"></span>
                  <span className="text-gray-600">Duplication</span>
                </div>
                <span className="font-medium">15%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-gray-100"></span>
                  <span className="text-gray-600">Security</span>
                </div>
                <span className="font-medium">15%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
