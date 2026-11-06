type TelegramWebApp = {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; last_name?: string; username?: string } };
  ready: () => void;
  expand: () => void;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string | undefined>;
  version?: string;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  };
  showConfirm?: (message: string, cb: (ok: boolean) => void) => void;
  MainButton?: { hide: () => void };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const tg = () => window.Telegram?.WebApp;

/** Sayt Telegram ichida emas, oddiy brauzerda ochilganmi. */
export const isTelegram = () => Boolean(window.Telegram?.WebApp?.initData);

export function haptic(kind: 'tap' | 'success' | 'error' = 'tap') {
  const h = tg()?.HapticFeedback;
  if (!h) return;
  if (kind === 'tap') h.impactOccurred('light');
  else h.notificationOccurred(kind);
}

export function confirmAction(message: string): Promise<boolean> {
  const webapp = tg();
  if (webapp?.showConfirm) {
    return new Promise((resolve) => webapp.showConfirm!(message, resolve));
  }
  return Promise.resolve(window.confirm(message));
}

export function initTelegram() {
  const webapp = tg();
  if (!webapp) {
    document.documentElement.dataset.scheme = 'light';
    return;
  }

  const root = document.documentElement;
  const theme = webapp.themeParams ?? {};
  const map: Record<string, string | undefined> = {
    '--tg-bg': theme.bg_color,
    '--tg-secondary-bg': theme.secondary_bg_color,
    '--tg-text': theme.text_color,
    '--tg-hint': theme.hint_color,
    '--tg-link': theme.link_color,
    '--tg-button': theme.button_color,
    '--tg-button-text': theme.button_text_color,
  };

  for (const [key, value] of Object.entries(map)) {
    if (value) root.style.setProperty(key, value);
  }
  root.dataset.scheme = webapp.colorScheme ?? 'light';

  webapp.ready();
  webapp.expand();
  webapp.MainButton?.hide();
}
