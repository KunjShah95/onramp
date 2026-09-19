export default function GlobalBackground({ children }: { children: React.ReactNode }) {
  // Calm composed canvas — plain room background only.
  // No glow pools, no plot-grid, no ambient gradients (AI bloat removed).
  return (
    <div className="min-h-screen w-full bg-room">
      <div className="min-h-screen">{children}</div>
    </div>
  );
}
