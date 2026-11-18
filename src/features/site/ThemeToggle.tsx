'use client';
// Navbar day/night switch, wired to the shared theme store.
import ThemeSwitch from '@/components/core/theme-switch';
import { useTheme } from '@/lib/theme';

export function ThemeToggle({ labels }: { labels: { toNight: string; toDay: string; nightOn: string; dayOn: string } }) {
  const { resolved, setTheme } = useTheme();
  return <ThemeSwitch theme={resolved} onThemeChange={setTheme} labels={labels} />;
}
