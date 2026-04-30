import React from 'react';
import './BottomTabBar.css';

/**
 * BottomTabBar — 4 customer-facing tabs (Menu / Merch / Rides / Nights).
 * Router-agnostic: parent owns the active tab state.
 *
 * Props:
 *   active   : 'menu' | 'merch' | 'rides' | 'nights'
 *   onChange : (id) => void
 *   lang     : 'tr' | 'en'   default 'tr'
 */

const TABS = [
  { id: 'menu',   tr: 'Menü',   en: 'Menu'   },
  { id: 'merch',  tr: 'Merch',  en: 'Merch'  },
  { id: 'rides',  tr: 'Rides',  en: 'Rides'  },
  { id: 'nights', tr: 'Nights', en: 'Nights' },
];

const ICON = {
  menu: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 6h17M3.5 12h17M3.5 18h12" />
    </svg>
  ),
  merch: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4L4 7l2 3 2-1v11h8V9l2 1 2-3-4-3h-2a2 2 0 0 1-4 0H8z" />
    </svg>
  ),
  rides: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M5.5 17.5L10 9h5l3.5 8.5M10 9h-2M15 9l-2-3h-2.5" />
    </svg>
  ),
  nights: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.5 13.5A8 8 0 1 1 10.5 3.5a6.5 6.5 0 0 0 10 10z" />
    </svg>
  ),
};

export default function BottomTabBar({ active, onChange, lang = 'tr' }) {
  return (
    <nav
      className="nip-tabbar"
      role="tablist"
      aria-label={lang === 'en' ? 'Main navigation' : 'Ana gezinme'}
    >
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={'nip-tab' + (isActive ? ' is-active' : '')}
            onClick={() => onChange && onChange(t.id)}
          >
            <span className="nip-tab-indicator" aria-hidden="true" />
            <span className="nip-tab-icon" aria-hidden="true">
              {ICON[t.id]}
            </span>
            <span className="nip-tab-label">
              {lang === 'en' ? t.en : t.tr}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
