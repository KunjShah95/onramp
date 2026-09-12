export default function GlobalBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full">
      {/* Ambient canvas — token-driven so it follows every app theme.
          Line-grid floor + accent glow pools: the same glow-and-glass DNA
          as the public landing, kept quiet behind the app shell. */}
      <div className="fixed inset-0 z-[-10] w-full h-full overflow-hidden pointer-events-none bg-room">
        {/* line-grid floor, faded toward the edges (radial mask) */}
        <div
          aria-hidden
          className="bg-plot-grid absolute inset-0 opacity-40"
          style={{
            maskImage: 'radial-gradient(ellipse 85% 65% at 50% 0%, black 15%, transparent 72%)',
            WebkitMaskImage: 'radial-gradient(ellipse 85% 65% at 50% 0%, black 15%, transparent 72%)',
          }}
        />
        {/* accent glow pools — depth via light, not shadow */}
        <div className="bg-accent-primary/[0.07] absolute -top-24 left-1/3 h-[380px] w-[560px] rounded-full blur-[120px]" />
        <div className="bg-accent-via/[0.05] absolute top-[32%] -right-28 h-[320px] w-[440px] rounded-full blur-[130px]" />
        <div className="bg-gradient-ambient absolute left-1/4 top-0 h-[220px] w-[320px] opacity-60 sm:h-[400px] sm:w-[600px]" />
      </div>
      {/* Content */}
      <div className="relative z-0 min-h-screen">
        {children}
      </div>
    </div>
  );
}
