import { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from 'react-oidc-context';
import { AUTH_DISABLED } from '@/lib/oidcConfig';

function buildInitials(name: string): string {
  const parts = name
    .replace(/@.*$/, '')
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const profile = auth.user?.profile;
  const name = AUTH_DISABLED
    ? 'Dev Mode'
    : (profile?.name as string | undefined) ||
      [(profile?.given_name as string | undefined), (profile?.family_name as string | undefined)]
        .filter(Boolean)
        .join(' ') ||
      (profile?.preferred_username as string | undefined) ||
      (profile?.email as string | undefined) ||
      'Usuario';
  const email = AUTH_DISABLED ? null : (profile?.email as string | undefined) ?? null;
  const initials = AUTH_DISABLED ? 'DV' : buildInitials(name);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = () => {
    setOpen(false);
    if (AUTH_DISABLED) return;
    void auth.signoutRedirect();
  };

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-border bg-card hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label="Abrir menu de usuario"
      >
        <span className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold select-none">
          {initials}
        </span>
        <span className="hidden md:flex flex-col items-start leading-tight max-w-[160px]">
          <span className="text-sm font-semibold text-foreground truncate w-full">{name}</span>
          {email && (
            <span className="text-xs text-muted-foreground truncate w-full">{email}</span>
          )}
        </span>
        <ChevronDown className="hidden md:inline w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.8} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <span className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold flex-shrink-0">
              {initials}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{name}</div>
              {email && <div className="text-xs text-muted-foreground truncate">{email}</div>}
            </div>
          </div>
          {!AUTH_DISABLED && (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.8} />
              Cerrar sesión
            </button>
          )}
        </div>
      )}
    </div>
  );
}
