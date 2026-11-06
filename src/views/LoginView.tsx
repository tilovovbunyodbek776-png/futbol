import { useState, type FormEvent } from 'react';
import { api, setUserToken } from '../api';
import { haptic } from '../telegram';

export default function LoginView({ onDone, onAdmin }: { onDone: () => void; onAdmin: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/[\s()-]/g, '');
    if (name.trim().length < 2) {
      setError('Ismingizni kiriting');
      return;
    }
    if (!/^\+?\d{9,15}$/.test(cleanPhone)) {
      setError('Telefon raqamini to‘g‘ri kiriting (masalan +998901234567)');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await api.login(name.trim(), cleanPhone);
      setUserToken(res.token);
      haptic('success');
      onDone();
    } catch (err) {
      setError((err as Error).message);
      haptic('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <section className="hello">
        <h2 className="hello__title">Xush kelibsiz! 👋</h2>
        <p className="hello__text">Maydonni tanlab, sanani belgilang va qulay vaqtni bir necha bosishda bron qiling.</p>
      </section>

      <form className="card card--pad stack login login--form" onSubmit={submit}>
        <div className="login__icon">⚽</div>
        <h2 className="login__title">Saytga kirish</h2>
        <p className="login__text">Ro‘yxatdan o‘tish shart emas — ism va telefon raqami yetarli.</p>

        <label className="label">
          Ism Familiya
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ism Familiya"
            autoComplete="name"
          />
        </label>
        <label className="label">
          Telefon raqami
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998901234567"
            inputMode="tel"
            autoComplete="tel"
          />
        </label>

        {error && <div className="notice notice--error notice--inline">{error}</div>}

        <button className="btn btn--block btn--lg" type="submit" disabled={busy}>
          {busy ? 'Kirilmoqda…' : 'Kirish'}
        </button>
        <p className="muted muted--tiny">Bronlar shu telefon raqamiga bog‘lanadi — keyingi safar shu raqam bilan kirasiz.</p>
      </form>

      <button className="btn btn--ghost btn--block" onClick={onAdmin}>
        Admin panel
      </button>
    </div>
  );
}
