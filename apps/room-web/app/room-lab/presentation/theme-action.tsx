import { useEffect, useState } from 'react';
import { copy } from '../copy';
import { Button } from '~/components/ui/button';

type ThemeChoice = 'light' | 'dark' | undefined;
const THEME_KEY = 'rivus-theme';
const themeLabels = {
  system: copy.label.themeSystem,
  light: copy.label.themeLight,
  dark: copy.label.themeDark,
} as const;

const SYSTEM_DARK = '(prefers-color-scheme: dark)';

/** shadcn switches on a `dark` class, so 跟随系统 has to resolve the query itself. */
function applyTheme(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === undefined && window.matchMedia(SYSTEM_DARK).matches);
  document.documentElement.classList.toggle('dark', dark);
}

/**
 * Three states, one text action: follow the system, force light, force dark.
 * The choice is written to the same key the inline script in root.tsx reads
 * before first paint, so a reload does not flash the other theme.
 */
export function ThemeAction() {
  const [choice, setChoice] = useState<ThemeChoice>(undefined);
  // Read after mount: the server has no localStorage, and the button's first
  // client render has to match the markup the server sent.
  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
      setChoice(stored);
    }
  }, []);
  // While following the system there is no media query doing the work for us:
  // the class has to be restamped whenever the system flips.
  useEffect(() => {
    if (choice !== undefined) {
      return;
    }
    const query = window.matchMedia(SYSTEM_DARK);
    const sync = () => applyTheme(undefined);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [choice]);
  const cycle = () => {
    const next: ThemeChoice = choice === undefined ? 'light' : choice === 'light' ? 'dark' : undefined;
    setChoice(next);
    if (next) {
      window.localStorage.setItem(THEME_KEY, next);
    } else {
      window.localStorage.removeItem(THEME_KEY);
    }
    applyTheme(next);
  };
  return (
    <Button variant="ghost" size="xs" onClick={cycle}>
      {copy.label.theme(themeLabels[choice ?? 'system'])}
    </Button>
  );
}
