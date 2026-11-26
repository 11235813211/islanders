import { type ReactNode, useEffect } from 'react';
import { ChristmasTheme } from '../../art';
import './christmas-theme.css';

/**
 * The Christmas look for a room that has it on: winter tiles and festive cards (through the art's
 * ChristmasTheme), and the page's colors (the `theme-christmas` class on the document).
 */
export default function ChristmasLook({ on, children }: { on: boolean; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.toggle('theme-christmas', on);
    return () => document.documentElement.classList.remove('theme-christmas');
  }, [on]);
  return <ChristmasTheme.Provider value={on}>{children}</ChristmasTheme.Provider>;
}
