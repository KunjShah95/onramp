export default function GlobalNatureBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full">
      <div className="fixed inset-0 z-[-10] w-full h-full overflow-hidden pointer-events-none bg-[#050810]"></div>
      
      {/* Content wrapper */}
      <div className="relative z-0 min-h-screen">
        {children}
      </div>
    </div>
  );
}
