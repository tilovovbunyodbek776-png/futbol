import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Field, Me } from '../types';
import { formatPrice } from '../utils';

export default function FieldsView({ me, onSelect }: { me: Me; onSelect: (field: Field) => void }) {
  const [fields, setFields] = useState<Field[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .fields()
      .then((r) => setFields(r.fields))
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="stack">
      <section className="hello">
        <h2 className="hello__title">
          Salom{me.user ? `, ${me.user.first_name}` : ''}! 👋
        </h2>
        <p className="hello__text">Maydonni tanlang, sanani belgilang va qulay vaqtni bir necha bosishda bron qiling.</p>
      </section>

      {error && <div className="notice notice--error">{error}</div>}

      {!fields && !error && (
        <>
          <div className="skeleton skeleton--card" />
          <div className="skeleton skeleton--card" />
        </>
      )}

      {fields?.length === 0 && (
        <div className="notice">
          <strong>Hozircha maydon yo‘q</strong>
          <p>Admin panel orqali maydon qo‘shishingiz mumkin.</p>
        </div>
      )}

      {fields?.map((field) => (
        <article key={field.id} className="card field">
          <div className="field__media">
            {field.image_url ? (
              <img className="field__img" src={field.image_url} alt={field.name} loading="lazy" />
            ) : (
              <div className="field__img field__img--empty">⚽</div>
            )}
            <span className="field__price">{formatPrice(field.price_per_hour)}<small>/soat</small></span>
          </div>
          <div className="field__body">
            <h3 className="field__name">{field.name}</h3>
            {field.address && <p className="field__meta">📍 {field.address}</p>}
            <p className="field__meta">🕒 {field.open_time} – {field.close_time}</p>
            <button className="btn btn--block" onClick={() => onSelect(field)}>
              Vaqtni tanlash
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
