import { useCallback, useEffect, useState } from 'react';
import { api, setUserToken } from './api';
import type { Field, Me } from './types';
import { initials } from './utils';
import { isTelegram, tg } from './telegram';
import FieldsView from './views/FieldsView';
import BookingView from './views/BookingView';
import MyBookingsView from './views/MyBookingsView';
import AdminView from './views/AdminView';
import LoginView from './views/LoginView';

type Tab = 'fields' | 'my' | 'admin';

const NAV: { id: Tab; label: string; icon: JSX.Element }[] = [
  {
    id: 'fields',
    label: 'Maydonlar',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <path d="M12 4v16M3 12h3M18 12h3" />
        <circle cx="12" cy="12" r="2.6" />
      </svg>
    ),
  },
  {
    id: 'my',
    label: 'Bronlarim',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        <path d="m9 15 2 2 4-4" />
      </svg>
    ),
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 3.5 5 6.2v5.4c0 4.2 2.9 7.6 7 8.9 4.1-1.3 7-4.7 7-8.9V6.2L12 3.5Z" />
        <path d="M12 11v3.2M12 8.3v.2" />
      </svg>
    ),
  },
];

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('fields');
  const [field, setField] = useState<Field | null>(null);

  const loadMe = useCallback(async () => {
    try {
      setMe(await api.me());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    const webapp = tg();
    if (!webapp?.BackButton) return;
    if (!field) {
      webapp.BackButton.hide();
      return;
    }
    const onBack = () => setField(null);
    webapp.BackButton.show();
    webapp.BackButton.onClick(onBack);
    return () => {
      webapp.BackButton.offClick(onBack);
      webapp.BackButton.hide();
    };
  }, [field]);

  const goHome = () => {
    setField(null);
    setTab('fields');
  };

  const logout = () => {
    setUserToken(null);
    setField(null);
    setTab('fields');
    setMe(null);
    void loadMe();
  };

  const signedIn = Boolean(me?.user);
  // Kirish ekranidan admin panelga ham o'tish mumkin (parol bilan)
  const showAdminGate = !signedIn && tab === 'admin';

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">⚽</span>
          <div>
            <p className="topbar__eyebrow">Onlayn bron</p>
            <h1 className="topbar__title">Futbol Maydoni</h1>
          </div>
        </div>
        <div className="topbar__user">
          {me?.user && <div className="avatar">{initials(`${me.user.first_name} ${me.user.last_name ?? ''}`)}</div>}
          {signedIn && !isTelegram() && (
            <button className="topbar__logout" onClick={logout}>
              Chiqish
            </button>
          )}
        </div>
      </header>

      {!me && !error && (
        <div className="stack">
          <div className="skeleton skeleton--tall" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}

      {error && (
        <div className="notice notice--error">
          <strong>Ulanish xatosi</strong>
          <p>{error}</p>
          <button className="btn btn--ghost btn--sm" onClick={() => void loadMe()}>
            Qayta urinish
          </button>
        </div>
      )}

      {me && signedIn && (
        <>
          {field ? (
            <BookingView field={field} me={me} onBack={() => setField(null)} onGoToMy={() => { setField(null); setTab('my'); }} />
          ) : (
            <>
              {tab === 'fields' && <FieldsView me={me} onSelect={setField} />}
              {tab === 'my' && <MyBookingsView me={me} onBook={goHome} />}
              {tab === 'admin' && <AdminView me={me} onAuthChanged={() => void loadMe()} />}
            </>
          )}

          {!field && (
            <nav className="tabbar">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  className={`navbtn${tab === item.id ? ' navbtn--active' : ''}`}
                  onClick={() => setTab(item.id)}
                >
                  <span className="navbtn__icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>
          )}
        </>
      )}

      {me && !signedIn && (
        <div className="stack">
          {showAdminGate && (
            <button className="backlink" onClick={() => setTab('fields')}>
              ← Bosh sahifa
            </button>
          )}
          {showAdminGate ? (
            <AdminView me={me} onAuthChanged={() => void loadMe()} />
          ) : (
            <LoginView onDone={() => void loadMe()} onAdmin={() => setTab('admin')} />
          )}
        </div>
      )}
    </div>
  );
}
