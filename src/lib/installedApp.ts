/**
 * The home-screen app (the site added to a phone's home screen). Links always open in the browser
 * on iPhone, and on Android when tapped inside Chrome, so an invite opened there offers to move to
 * the app instead (see OpenInAppBanner).
 */

const HAS_APP_KEY = 'islanders:has-app';
const DISMISSED_KEY = 'islanders:open-in-app-dismissed';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage may be disabled. */
  }
}

/** True inside the home-screen app rather than a browser tab. */
export function runningAsApp(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || matchMedia('(display-mode: standalone)').matches;
}

/**
 * Note that this device has the home-screen app. Android's Chrome shares storage with the app, so
 * the browser learns it; iPhone keeps them apart, so there the browser never knows.
 */
export function rememberApp(): void {
  if (runningAsApp()) write(HAS_APP_KEY, '1');
}

const iPhoneOrIPad = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Whether to offer moving to the home-screen app: never inside the app, once turned off, or on a
 * computer. Android: only when the app is known to be installed. iPhone can't tell, so it offers.
 */
export async function mayHaveApp(): Promise<boolean> {
  if (runningAsApp() || read(DISMISSED_KEY) === '1') return false;
  if (read(HAS_APP_KEY) === '1') return true;
  const related = (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> })
    .getInstalledRelatedApps;
  if (related) {
    try {
      if ((await related.call(navigator)).length) return true;
    } catch {
      /* Not allowed here. */
    }
  }
  return iPhoneOrIPad();
}

/** Stop offering to move to the app on this device. */
export function dismissAppOffer(): void {
  write(DISMISSED_KEY, '1');
}
