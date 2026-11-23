import type { AppTab } from './routing';

type TabBarProps = {
  activeTab: AppTab;
  onNavigate: (to: string) => void;
};

// RED skeleton so the acceptance tests compile and fail on assertions.
// The real bottom tab bar lands with the GREEN step.
export function TabBar(_props: TabBarProps) {
  return null;
}
