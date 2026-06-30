import { AuthProvider, useAuth } from 'react-oidc-context';
import { oidcConfig, AUTH_DISABLED } from './lib/oidcConfig';
import { CalendarDashboard } from './pages/calendario';
import { CalendarLayout } from './components/layout/CalendarLayout';

function AppShell() {
  const auth = useAuth();

  if (!AUTH_DISABLED) {
    if (auth.isLoading) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <p style={{ color: '#555', fontFamily: 'Calibri, sans-serif', fontSize: '1rem' }}>Iniciando sesión…</p>
        </div>
      );
    }

    if (!auth.isAuthenticated) {
      void auth.signinRedirect();
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <p style={{ color: '#555', fontFamily: 'Calibri, sans-serif', fontSize: '1rem' }}>Redirigiendo…</p>
        </div>
      );
    }
  }

  return (
    <CalendarLayout>
      <CalendarDashboard />
    </CalendarLayout>
  );
}

export default function App() {
  return (
    <AuthProvider {...oidcConfig}>
      <AppShell />
    </AuthProvider>
  );
}
