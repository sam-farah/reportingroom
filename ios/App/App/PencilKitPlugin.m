#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Register the PencilKit plugin so Capacitor can bridge it to JavaScript.
// The plugin class is implemented in PencilKitPlugin.swift.
CAP_PLUGIN(PencilKitPlugin, "PencilKit",
    CAP_PLUGIN_METHOD(present, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
)
