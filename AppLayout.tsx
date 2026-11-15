import { Link, useLocation } from "wouter";
import { Activity, BarChart2, Brain } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 glass-panel border-b border-white/5 border-x-0 border-t-0 rounded-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shadow-lg group-hover:bg-white/15 transition-all">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-display font-bold text-foreground leading-none tracking-wide">
                  NBA<span className="text-primary">Analytics</span>
                </h1>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-0.5">
                  Machine Learning
                </p>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <NavButton href="/" icon={<BarChart2 className="w-4 h-4" />} label="Dashboard" active={location === "/"} />
              <NavButton href="/analytics" icon={<Brain className="w-4 h-4" />} label="ML Analytics" active={location === "/analytics"} />
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {children}
      </main>
    </div>
  );
}

function NavButton({ href, icon, label, active }: { href: string, icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-white/10 text-foreground'
          : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
