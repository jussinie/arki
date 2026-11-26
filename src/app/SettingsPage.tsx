import { WaterGoalSetting } from '../features/water';
import './SettingsPage.css';

type SettingsPageProps = {
  today: string;
};

export function SettingsPage({ today }: SettingsPageProps) {
  return (
    <main className="settings">
      <h2>Settings</h2>
      <WaterGoalSetting today={today} />
    </main>
  );
}
