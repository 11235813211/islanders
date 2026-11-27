import { type ReactNode, useEffect } from 'react';
import { ChristmasTheme } from '../../art';
import { CandyTheme } from '../../art/candy-options';
import './christmas-theme.css';

/**
 * The Christmas look for a room that has it on: winter tiles and festive cards (through the art's
 * ChristmasTheme), the page's colors (the `theme-christmas` class on the document), and snow falling
 * behind the page.
 */
export default function ChristmasLook({
  on,
  candy = false,
  children,
}: {
  on: boolean;
  candy?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('theme-christmas', on);
    return () => document.documentElement.classList.remove('theme-christmas');
  }, [on]);
  return (
    <ChristmasTheme.Provider value={on}>
      {on && (
        <div className="xmas-snowfall" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}
      <CandyTheme.Provider value={on && candy}>{children}</CandyTheme.Provider>
    </ChristmasTheme.Provider>
  );
}
