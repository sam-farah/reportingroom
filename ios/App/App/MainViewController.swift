import UIKit
import Capacitor

// Custom Capacitor bridge view controller.
//
// As of Capacitor 6+, plugins declared INSIDE the app target are no longer
// auto-registered through the legacy Objective-C `CAP_PLUGIN` macro
// (see ionic-team/capacitor#7443). We must register the instance explicitly
// here in `capacitorDidLoad()` so the web layer can see `PencilKit` via
// `Capacitor.isPluginAvailable('PencilKit')`.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(PencilKitPlugin())
    }
}
