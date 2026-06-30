import { ReactNode, useState, useEffect } from 'react';
import { MapPin, Menu, X } from 'lucide-react';
import { CalendarSidebar, CalendarSidebarContents } from './CalendarSidebar';
import { UserMenu } from './UserMenu';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
}

export function CalendarLayout({ children }: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [mobileNavOpen]);

  return (
    <div className="min-h-screen flex bg-background">
      <CalendarSidebar />

      {/* Mobile nav overlay */}
      <div
        className={cn(
          'fixed inset-0 z-50 md:hidden transition-opacity',
          mobileNavOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      >
        <div
          className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
          onClick={() => setMobileNavOpen(false)}
        />
        <aside
          className={cn(
            'absolute left-0 top-0 bottom-0 w-[85%] max-w-xs bg-sidebar transition-transform duration-300 shadow-xl',
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button
            onClick={() => setMobileNavOpen(false)}
            className="absolute -right-12 top-3 w-10 h-10 rounded-md bg-card border border-border flex items-center justify-center text-foreground"
            aria-label="Cerrar menu"
          >
            <X className="w-4 h-4" strokeWidth={1.8} />
          </button>
          <CalendarSidebarContents onNavigate={() => setMobileNavOpen(false)} />
        </aside>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-background text-foreground border-b border-border">
          <div className="px-3 sm:px-6 lg:px-10 py-3 sm:py-4">
            <div className="flex items-center gap-2 sm:gap-3 w-full">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="md:hidden w-9 h-9 flex-shrink-0 rounded-md border border-border bg-card flex items-center justify-center text-foreground hover:bg-muted transition-colors"
                aria-label="Abrir menu"
              >
                <Menu className="w-4 h-4" strokeWidth={1.8} />
              </button>

              <div className="flex-1 min-w-0">
                <div className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground truncate">
                  Jardin Ziba
                </div>
                <h1 className="font-serif-display text-xl sm:text-2xl md:text-3xl font-bold text-foreground leading-tight truncate mt-0.5">
                  Calendario
                </h1>
              </div>

              <UserMenu />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-10 animate-fade-in">
          <div className="animate-fade-in-up">{children}</div>
        </main>

        <footer className="px-4 sm:px-6 lg:px-10 py-4 border-t border-border text-sm text-muted-foreground flex flex-col md:flex-row md:items-center md:justify-between gap-2 bg-card">
          <div className="flex items-start sm:items-center gap-2">
            <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5 sm:mt-0" strokeWidth={2} />
            <span>La Galicia 0, Ahuatenco - Cuajimalpa de Morelos - 05039 CDMX</span>
          </div>
          <span>(c) {new Date().getFullYear()} Jardin Ziba</span>
        </footer>
      </div>
    </div>
  );
}
