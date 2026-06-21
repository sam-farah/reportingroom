/**
 * PencilKit bridge — thin TypeScript wrapper around the native iOS Capacitor plugin.
 *
 * On the web (non-Capacitor) or on Android, `isPencilKitAvailable()` returns
 * false and `presentPencilCanvas()` throws, so call-sites must always check
 * availability before invoking the canvas.
 *
 * The native plugin is registered as "PencilKit" in Capacitor's plugin registry
 * (see ios/App/App/PencilKitPlugin.swift).
 */

export interface PencilKitOptions {
  /** PNG/JPEG data URL to render as a non-erasable background behind the strokes.
   *  Pass the template canvas.toDataURL() here so the worksheet grid shows. */
  backgroundDataUrl?: string;
}

export interface PencilKitResult {
  /** PNG data URL of the composited image (background + strokes).
   *  Interchangeable with canvas.toDataURL('image/png'). */
  dataUrl: string;
}

/** Returns true when the PencilKit native plugin is reachable.
 *  This is only true inside the Capacitor iOS app on a device/simulator. */
export function isPencilKitAvailable(): boolean {
  try {
    const cap = (window as any).Capacitor;
    if (!cap) return false;
    if (cap.getPlatform() !== 'ios') return false;
    const plugin = cap.Plugins?.PencilKit;
    return !!plugin;
  } catch {
    return false;
  }
}

/** Open the native PencilKit drawing canvas modally.
 *  Rejects with message "cancelled" if the user taps Cancel.
 *  @throws if called when isPencilKitAvailable() === false */
export async function presentPencilCanvas(
  options: PencilKitOptions = {}
): Promise<PencilKitResult> {
  const cap = (window as any).Capacitor;
  const plugin = cap?.Plugins?.PencilKit;
  if (!plugin) {
    throw new Error('PencilKit plugin is not available on this platform');
  }
  const result = await plugin.present({
    backgroundDataUrl: options.backgroundDataUrl ?? null,
  });
  return result as PencilKitResult;
}
