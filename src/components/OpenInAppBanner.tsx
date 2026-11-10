import { Smartphone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { dismissAppOffer, mayHaveApp } from '../lib/installedApp';

/**
 * Shown at the top when an invite opened in a phone's browser and the player may have the
 * home-screen app: "Open there" copies the invite and gives up the seat taken here (so there is no
 * second one), then the player pastes the invite into the app's join box.
 */
export default function OpenInAppBanner({ moveToApp }: { moveToApp: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let live = true;
    void mayHaveApp().then(may => live && setShown(may));
    return () => {
      live = false;
    };
  }, []);
  if (!shown) return null;
  return (
    <div className="open-in-app" role="region" aria-label="Open in the app">
      <Smartphone size={20} />
      <span>Playing from your home-screen app?</span>
      <button type="button" className="button primary" onClick={moveToApp}>
        Open there
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Don't ask again"
        onClick={() => {
          dismissAppOffer();
          setShown(false);
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
