import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "au.com.reportingroom.app",
  appName: "Reporting Room",
  /**
   * webDir points at the Vite build output directory.
   * Run `npm run build` before `npx cap sync` to refresh the bundle.
   */
  webDir: "dist/public",
  ios: {
    /**
     * Allow scroll bounce to feel native on iPad.
     * contentInset: "always" keeps content below the notch/home indicator.
     */
    contentInset: "always",
    scrollEnabled: true,
    /**
     * Limousine-dark background while the splash screen is shown so the
     * white launch screen doesn't flash on a cold start.
     */
    backgroundColor: "#1a3a6b",
  },
  plugins: {
    /**
     * SplashScreen: hide automatically after the web layer is ready.
     * The delay gives React time to hydrate before the splash fades out.
     */
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#1a3a6b",
      showSpinner: false,
    },
    /**
     * CapacitorHttp: use the native HTTP stack so cookies are managed by
     * iOS (WKWebView) rather than the JavaScript fetch API.  This fixes
     * session-cookie persistence for the deployed backend.
     */
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
