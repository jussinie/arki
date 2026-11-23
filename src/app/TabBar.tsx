import type { MouseEvent } from 'react';
import type { AppTab } from './routing';
import { FOOD_PATH, SETTINGS_PATH, TODAY_PATH } from './routing';
import './TabBar.css';

type TabBarProps = {
  activeTab: AppTab;
  onNavigate: (to: string) => void;
};

const TABS: ReadonlyArray<{ id: AppTab; label: string; path: string }> = [
  { id: 'water', label: 'Water', path: TODAY_PATH },
  { id: 'food', label: 'Food', path: FOOD_PATH },
  { id: 'settings', label: 'Settings', path: SETTINGS_PATH },
];

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Bottom navigation between the app's tabs. Tabs are real anchors so they
 * stay linkable and keyboard-reachable; plain left clicks are intercepted
 * for in-app history navigation.
 */
export function TabBar({ activeTab, onNavigate }: TabBarProps) {
  function handleTabClick(event: MouseEvent<HTMLAnchorElement>, path: string) {
    if (!isPlainLeftClick(event)) {
      return;
    }
    event.preventDefault();
    onNavigate(path);
  }

  return (
    <nav className="tab-bar" aria-label="Primary">
      <ul>
        {TABS.map((tab) => (
          <li key={tab.id}>
            <a
              href={tab.path}
              aria-current={tab.id === activeTab ? 'page' : undefined}
              onClick={(event) => {
                handleTabClick(event, tab.path);
              }}
            >
              {tab.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
