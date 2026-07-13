export default function GlobalBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full">
      {/* Ambient gradient glow */}
      <div className="fixed inset-0 z-[-10] w-full h-full pointer-events-none bg-bg-primary">
        <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-gradient-ambient opacity-60" />
      </div>
      {/* Content */}
      <div className="relative z-0 min-h-screen">
        {children}
      </div>
    </div>
  );
}
