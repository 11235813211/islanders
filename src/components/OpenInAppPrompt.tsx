import { Smartphone } from 'lucide-react';
import { dismissAppOffer } from '../lib/installedApp';

/**
 * Before an invite joins in a phone's browser, when the player may have the home-screen app:
 * "Open in app" copies the invite to paste into the app (iPhone can't open the app from a link);
 * "Continue here" joins in this browser. "Don't ask again" also continues here.
 */
export default function OpenInAppPrompt({ openInApp, stayHere }: { openInApp: () => void; stayHere: () => void }) {
  return (
    <div className="open-in-app" role="dialog" aria-label="Open in the Islanders app?">
      <p>
        <Smartphone size={20} />
        Open in the Islanders app?
      </p>
      <div className="open-in-app-actions">
        <button type="button" className="button primary" onClick={openInApp}>
          Open in app
        </button>
        <button type="button" className="button secondary" onClick={stayHere}>
          Continue here
        </button>
      </div>
      <button
        type="button"
        className="text-button open-in-app-never"
        onClick={() => {
          dismissAppOffer();
          stayHere();
        }}
      >
        Don't ask again
      </button>
    </div>
  );
}
