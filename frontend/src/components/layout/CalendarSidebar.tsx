import { CalendarDays, Leaf } from 'lucide-react';

const OESTE_URL = 'https://oesteinvestgroup.com/#!/es';

export function CalendarSidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground font-sans">
      <div className="px-5 py-6 md:py-0 md:h-[140px] flex items-center border-b border-sidebar-border bg-gradient-to-br from-primary/5 via-transparent to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm ring-1 ring-primary/20 flex-shrink-0">
            <Leaf className="w-5 h-5 text-primary-foreground" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-xl leading-none text-foreground truncate">Jardin Ziba</div>
            <div className="text-sm font-medium text-muted-foreground mt-1.5 tracking-wide truncate">Salon de eventos</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin py-5 px-3">
        <ul className="space-y-1.5">
          <li>
            <button
              type="button"
              onClick={onNavigate}
              className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-sm shadow-primary/20"
            >
              <CalendarDays className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
              <span className="flex-1 text-base font-semibold">Calendario</span>
            </button>
          </li>
        </ul>
      </nav>

      <div className="px-5 py-5 border-t border-sidebar-border bg-sidebar-accent/30">
        <a
          href={OESTE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Oeste Invest Group - visitar sitio"
          className="block group"
          title="Visitar oesteinvestgroup.com"
        >
          <div className="flex items-center gap-2 pt-3 border-t border-sidebar-border/70">
            <img
              src="/oeste-logo.svg"
              alt="oeste"
              className="w-9 h-9 flex-shrink-0 transition-transform group-hover:scale-105"
            />
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                Organización de Estudios
              </div>
              <div className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                del Territorio
              </div>
            </div>
          </div>
        </a>
      </div>
    </div>
  );
}

export function CalendarSidebar() {
  return (
    <aside className="hidden md:flex md:w-64 lg:w-72 flex-col border-r border-sidebar-border min-h-screen">
      <CalendarSidebarContents />
    </aside>
  );
}
