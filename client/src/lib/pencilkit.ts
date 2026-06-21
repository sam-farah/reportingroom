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

import { Capacitor, registerPlugin } from '@capacitor/core';

interface PencilKitNativePlugin {
  present(options: { backgroundDataUrl?: string | null }): Promise<{ dataUrl: string }>;
  isAvailable(): Promise<{ available: boolean }>;
}

// registerPlugin returns a proxy bound to the native "PencilKit" plugin.
// This is the supported way to reach a custom native plugin in Capacitor 6+;
// the legacy `Capacitor.Plugins.PencilKit` global is NOT reliably populated.
const PencilKit = registerPlugin<PencilKitNativePlugin>('PencilKit');

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
    return (
      Capacitor.getPlatform() === 'ios' &&
      Capacitor.isPluginAvailable('PencilKit')
    );
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
  if (!isPencilKitAvailable()) {
    throw new Error('PencilKit plugin is not available on this platform');
  }
  const result = await PencilKit.present({
    backgroundDataUrl: options.backgroundDataUrl ?? null,
  });
  return result as PencilKitResult;
}
