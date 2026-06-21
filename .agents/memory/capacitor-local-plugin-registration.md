---
name: Capacitor local plugin registration (iOS)
description: Why app-local native iOS plugins (e.g. PencilKit) fail isPluginAvailable on Capacitor 6+ and how to register them.
---

App-local native iOS plugins (defined inside the App target, NOT an npm package) are not auto-registered in Capacitor 6+. The legacy Objective-C `CAP_PLUGIN(...)` macro in a `.m` file no longer registers them, so `Capacitor.isPluginAvailable('Name')` returns false even though the Swift file compiles and is in the Xcode target.

**Fix (the combination that works):**
- Swift plugin class: `@objc(NamePlugin)`, conforms to `CAPPlugin, CAPBridgedPlugin`, with `identifier`, `jsName`, `pluginMethods`.
- Add a `CAPBridgeViewController` subclass (e.g. `MainViewController.swift`) overriding `capacitorDidLoad()` → `bridge?.registerPluginInstance(NamePlugin())`.
- Point `Base.lproj/Main.storyboard` root viewController at it: `customClass="MainViewController" customModule="App" customModuleProvider="target"` (module = PRODUCT_NAME, here "App"); default is `CAPBridgeViewController`/`Capacitor`.
- Delete the legacy `.m` CAP_PLUGIN file (redundant + can conflict). Editing `project.pbxproj` by hand means keeping 4 refs in sync per file: PBXBuildFile, PBXFileReference, the App PBXGroup children, and the Sources build phase.
- JS `registerPlugin('Name')` string must equal Swift `jsName` exactly.

**Why:** ionic-team/capacitor#7443 — breaking change in Cap 6. Symptom here: the "Draw with Apple Pencil" button never appeared because `draw.tsx` / `drawing-canvas.tsx` gate it on `isPencilKitAvailable()` (= `getPlatform()==='ios' && isPluginAvailable('PencilKit')`).

**How to apply:** whenever a native iOS capability is added as an app-local Capacitor plugin, register it via `registerPluginInstance` in a custom bridge VC; do not rely on the `.m` macro. A diagnostic badge in `main.tsx` reads `isPluginAvailable`/legacy-global live on the device to confirm registration.
