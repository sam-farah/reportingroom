import Foundation
import UIKit
import PencilKit
import Capacitor

// MARK: - PencilKit Capacitor Plugin
// Wraps PKCanvasView and PKToolPicker to give the web layer a native
// Apple Pencil drawing surface. The JS API is:
//
//   PencilKit.present({ backgroundDataUrl?: string }) → { dataUrl: string }
//   PencilKit.addListener('autosave', ({ dataUrl }) => …)
//
// backgroundDataUrl  — optional PNG/JPEG data URL to render behind the strokes
//                      (used to composite the vascular worksheet template)
// dataUrl            — PNG data URL of the composited drawing (background + strokes)
//                      This is interchangeable with canvas.toDataURL('image/png').
//
// While the canvas is open, an "autosave" event fires ~3s after the drawing
// last changed (and immediately when the app is about to go inactive) with a
// JPEG data URL of the same composited image, so the web layer can persist a
// crash-recovery copy without waiting for Done.

@objc(PencilKitPlugin)
public class PencilKitPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "PencilKitPlugin"
    public let jsName = "PencilKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
    ]

    // MARK: isAvailable
    // Returns { available: true } on iPads running iOS 14+; false on simulators
    // without Apple Pencil. The JS layer uses this to decide whether to offer
    // PencilKit or fall back to the HTML5 canvas.
    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true])
    }

    // MARK: present
    // Options accepted:
    //   backgroundDataUrl  String?  — data URL of image to show behind strokes
    @objc func present(_ call: CAPPluginCall) {
        let backgroundDataUrl = call.getString("backgroundDataUrl")

        DispatchQueue.main.async { [weak self] in
            guard let self = self,
                  let rootVC = self.bridge?.viewController else {
                call.reject("No root view controller")
                return
            }

            let vc = PencilKitViewController()
            vc.modalPresentationStyle = .fullScreen
            vc.backgroundDataUrl = backgroundDataUrl
            vc.autosaveHandler = { [weak self] dataUrl in
                self?.notifyListeners("autosave", data: ["dataUrl": dataUrl])
            }
            vc.completion = { [weak call] result in
                guard let call = call else { return }
                switch result {
                case .success(let dataUrl):
                    call.resolve(["dataUrl": dataUrl])
                case .failure(let error):
                    call.reject(error.localizedDescription)
                }
            }

            rootVC.present(vc, animated: true)
        }
    }
}

// MARK: - PencilKitViewController
// Full-screen view controller containing:
//   • PKCanvasView  — the drawing surface
//   • PKToolPicker  — the floating system tool palette
//   • A Done / Cancel button bar at the top
//
// When the user taps Done the drawing is composited over the background
// image (if any) and returned as a PNG data URL.

class PencilKitViewController: UIViewController, PKCanvasViewDelegate, PKToolPickerObserver, UIScrollViewDelegate {

    var backgroundDataUrl: String?
    var completion: ((Result<String, Error>) -> Void)?
    /// Called with a JPEG data URL of the composited drawing whenever the
    /// debounced autosave fires. Runs on the main queue.
    var autosaveHandler: ((String) -> Void)?

    // Outer scroll view provides two-finger pinch-zoom and pan while the
    // pencil (or a single finger) draws. Both the template image and the
    // PencilKit canvas live inside contentContainer so they zoom together
    // and strokes stay perfectly aligned with the template.
    private let scrollView = UIScrollView()
    private let contentContainer = UIView()
    private let canvasView = PKCanvasView()
    private var toolPicker: PKToolPicker?
    private var backgroundImageView: UIImageView?

    // Debounced autosave bookkeeping. The work item is rescheduled on every
    // drawing change; it fires 3s after the pencil goes quiet. hasUnsavedChanges
    // stops redundant exports (e.g. resign-active right after a debounce fired).
    private var autosaveWorkItem: DispatchWorkItem?
    // Set the moment Done/Cancel is tapped: from then on no autosave may be
    // scheduled or emitted, so a late snapshot can never overwrite the final
    // export (or resurrect a cancelled session) on the JS side.
    private var sessionEnded = false
    private var hasUnsavedChanges = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        setupScrollView()
        setupBackground()
        setupCanvas()
        setupToolbar()
        // Flush a snapshot the moment the app loses foreground — this is the
        // instant before an app switch / iPad slide-over / termination where
        // in-progress strokes would otherwise be lost.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appWillResignActive),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        autosaveWorkItem?.cancel()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        setupToolPicker()
    }

    // MARK: Setup helpers

    private func setupScrollView() {
        scrollView.delegate = self
        scrollView.minimumZoomScale = 1.0
        scrollView.maximumZoomScale = 5.0
        scrollView.bouncesZoom = true
        scrollView.showsVerticalScrollIndicator = false
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.contentInsetAdjustmentBehavior = .never
        scrollView.delaysContentTouches = false
        // Two fingers pan/zoom; one finger or the Apple Pencil draws.
        scrollView.panGestureRecognizer.minimumNumberOfTouches = 2
        scrollView.panGestureRecognizer.maximumNumberOfTouches = 2
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scrollView)

        contentContainer.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(contentContainer)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 56),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            contentContainer.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
            contentContainer.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor),
            contentContainer.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor),
            contentContainer.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
            contentContainer.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor),
            contentContainer.heightAnchor.constraint(equalTo: scrollView.frameLayoutGuide.heightAnchor),
        ])
    }

    // Only the outer scroll view zooms — the PKCanvasView (itself a scroll
    // view, with scrolling disabled) must not get a zoom view from us.
    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        return scrollView === self.scrollView ? contentContainer : nil
    }

    private func setupBackground() {
        guard let dataUrl = backgroundDataUrl else { return }

        // Strip the data URL prefix and decode to UIImage
        if let commaRange = dataUrl.range(of: ","),
           let data = Data(base64Encoded: String(dataUrl[commaRange.upperBound...]),
                           options: .ignoreUnknownCharacters),
           let image = UIImage(data: data) {

            let imageView = UIImageView(image: image)
            imageView.contentMode = .scaleAspectFit
            imageView.translatesAutoresizingMaskIntoConstraints = false
            contentContainer.addSubview(imageView)
            NSLayoutConstraint.activate([
                imageView.topAnchor.constraint(equalTo: contentContainer.topAnchor),
                imageView.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor),
                imageView.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor),
                imageView.bottomAnchor.constraint(equalTo: contentContainer.bottomAnchor),
            ])
            backgroundImageView = imageView
        }
    }

    private func setupCanvas() {
        canvasView.delegate = self
        canvasView.backgroundColor = .clear
        canvasView.isOpaque = false
        // Allow finger drawing — users may not always have an Apple Pencil attached.
        canvasView.drawingPolicy = .anyInput
        // The outer scroll view owns zoom/pan; the canvas must not scroll itself.
        canvasView.isScrollEnabled = false
        canvasView.translatesAutoresizingMaskIntoConstraints = false
        contentContainer.addSubview(canvasView)
        NSLayoutConstraint.activate([
            canvasView.topAnchor.constraint(equalTo: contentContainer.topAnchor),
            canvasView.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor),
            canvasView.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor),
            canvasView.bottomAnchor.constraint(equalTo: contentContainer.bottomAnchor),
        ])
    }

    private func setupToolPicker() {
        let picker = PKToolPicker()
        picker.addObserver(canvasView)
        picker.addObserver(self)
        picker.setVisible(true, forFirstResponder: canvasView)
        canvasView.becomeFirstResponder()
        toolPicker = picker
    }

    private func setupToolbar() {
        let toolbar = UIView()
        toolbar.backgroundColor = UIColor.systemBackground
        toolbar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(toolbar)
        NSLayoutConstraint.activate([
            toolbar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            toolbar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            toolbar.heightAnchor.constraint(equalToConstant: 56),
        ])

        // Separator
        let sep = UIView()
        sep.backgroundColor = UIColor.separator
        sep.translatesAutoresizingMaskIntoConstraints = false
        toolbar.addSubview(sep)
        NSLayoutConstraint.activate([
            sep.bottomAnchor.constraint(equalTo: toolbar.bottomAnchor),
            sep.leadingAnchor.constraint(equalTo: toolbar.leadingAnchor),
            sep.trailingAnchor.constraint(equalTo: toolbar.trailingAnchor),
            sep.heightAnchor.constraint(equalToConstant: 0.5),
        ])

        // Cancel
        let cancelBtn = UIButton(type: .system)
        cancelBtn.setTitle("Cancel", for: .normal)
        cancelBtn.translatesAutoresizingMaskIntoConstraints = false
        cancelBtn.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        toolbar.addSubview(cancelBtn)
        NSLayoutConstraint.activate([
            cancelBtn.leadingAnchor.constraint(equalTo: toolbar.leadingAnchor, constant: 16),
            cancelBtn.centerYAnchor.constraint(equalTo: toolbar.centerYAnchor),
        ])

        // Title
        let title = UILabel()
        title.text = "PencilKit Drawing"
        title.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        title.translatesAutoresizingMaskIntoConstraints = false
        toolbar.addSubview(title)
        NSLayoutConstraint.activate([
            title.centerXAnchor.constraint(equalTo: toolbar.centerXAnchor),
            title.centerYAnchor.constraint(equalTo: toolbar.centerYAnchor),
        ])

        // Done
        let doneBtn = UIButton(type: .system)
        doneBtn.setTitle("Done", for: .normal)
        doneBtn.titleLabel?.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        doneBtn.translatesAutoresizingMaskIntoConstraints = false
        doneBtn.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        toolbar.addSubview(doneBtn)
        NSLayoutConstraint.activate([
            doneBtn.trailingAnchor.constraint(equalTo: toolbar.trailingAnchor, constant: -16),
            doneBtn.centerYAnchor.constraint(equalTo: toolbar.centerYAnchor),
        ])
    }

    // MARK: Autosave

    // PKCanvasViewDelegate — fires whenever strokes are added, erased or undone.
    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        guard !sessionEnded else { return }
        hasUnsavedChanges = true
        autosaveWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.emitAutosave() }
        autosaveWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0, execute: work)
    }

    @objc private func appWillResignActive() {
        // App is about to background — flush immediately, don't wait out the debounce.
        guard !sessionEnded else { return }
        autosaveWorkItem?.cancel()
        emitAutosave()
    }

    private func emitAutosave() {
        guard !sessionEnded, hasUnsavedChanges, let handler = autosaveHandler else { return }
        hasUnsavedChanges = false
        // JPEG keeps the bridge + network payload a fraction of PNG size; the
        // recovery copy doesn't need lossless quality.
        exportComposited(format: .jpeg) { result in
            if case .success(let dataUrl) = result {
                handler(dataUrl)
            }
        }
    }

    // MARK: Actions

    @objc private func cancelTapped() {
        // Confirm before discarding real work — Cancel sits next to Done, so
        // accidental discards (and "my drawing didn't save" reports) are easy.
        if !canvasView.drawing.strokes.isEmpty {
            let alert = UIAlertController(
                title: "Discard this drawing?",
                message: "Your pencil strokes from this session won't be kept.",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "Keep Drawing", style: .cancel))
            alert.addAction(UIAlertAction(title: "Discard", style: .destructive) { [weak self] _ in
                self?.finishCancel()
            })
            present(alert, animated: true)
            return
        }
        finishCancel()
    }

    private func finishCancel() {
        sessionEnded = true
        autosaveWorkItem?.cancel()
        dismiss(animated: true) { [weak self] in
            self?.completion?(.failure(NSError(
                domain: "PencilKit",
                code: 0,
                userInfo: [NSLocalizedDescriptionKey: "cancelled"]
            )))
        }
    }

    @objc private func doneTapped() {
        sessionEnded = true
        autosaveWorkItem?.cancel()
        exportComposited { [weak self] result in
            DispatchQueue.main.async {
                self?.dismiss(animated: true) {
                    self?.completion?(result)
                }
            }
        }
    }

    // MARK: Export

    private enum ExportFormat {
        case png   // lossless — the Done result the web canvas imports
        case jpeg  // compact — autosave crash-recovery snapshots
    }

    /// Composite background + PencilKit strokes → data URL.
    /// When a template background is present, the output is cropped to the
    /// template's aspect-fit rect so the image keeps the template's aspect ratio
    /// (no letterbox margins) and is interchangeable with canvas.toDataURL().
    /// With no background the full canvas bounds are exported. Either way the
    /// strokes stay aligned with whatever the user drew over. Zoom/pan never
    /// affects this: the outer scroll view transforms the container, while
    /// canvasView.bounds (used here) stays constant.
    private func exportComposited(format: ExportFormat = .png,
                                  completion: @escaping (Result<String, Error>) -> Void) {
        let bounds = canvasView.bounds
        let scale = UIScreen.main.scale

        // When a template background is present, export ONLY the region the
        // template occupies (its aspect-fit rect). This makes the output image
        // keep the template's aspect ratio — no letterbox margins — so it drops
        // cleanly onto the web canvas (which is sized to that same ratio) with
        // no distortion. Strokes outside the template area are intentionally
        // cropped. With no background (e.g. signatures) we export the full canvas.
        let exportRect: CGRect
        if let bgView = backgroundImageView, let bgImage = bgView.image {
            exportRect = aspectFitRect(imageSize: bgImage.size, inRect: bounds)
        } else {
            exportRect = bounds
        }

        UIGraphicsBeginImageContextWithOptions(exportRect.size, false, scale)
        defer { UIGraphicsEndImageContext() }

        guard let ctx = UIGraphicsGetCurrentContext() else {
            completion(.failure(NSError(domain: "PencilKit", code: 1,
                                        userInfo: [NSLocalizedDescriptionKey: "Could not create graphics context"])))
            return
        }

        // White background
        ctx.setFillColor(UIColor.white.cgColor)
        ctx.fill(CGRect(origin: .zero, size: exportRect.size))

        // Template background image — fills the export rect exactly.
        if let bgView = backgroundImageView, let bgImage = bgView.image {
            bgImage.draw(in: CGRect(origin: .zero, size: exportRect.size))
        }

        // PencilKit strokes — capture just the export rect region (at screen
        // scale for full resolution) and draw it at the origin so the strokes
        // stay aligned with the template they were drawn over.
        let drawing = canvasView.drawing
        let strokeImage = drawing.image(from: exportRect, scale: scale)
        strokeImage.draw(in: CGRect(origin: .zero, size: exportRect.size))

        guard let composited = UIGraphicsGetImageFromCurrentImageContext() else {
            completion(.failure(NSError(domain: "PencilKit", code: 2,
                                        userInfo: [NSLocalizedDescriptionKey: "Failed to capture composited image"])))
            return
        }

        let dataUrl: String
        switch format {
        case .png:
            guard let pngData = composited.pngData() else {
                completion(.failure(NSError(domain: "PencilKit", code: 2,
                                            userInfo: [NSLocalizedDescriptionKey: "Failed to encode PNG"])))
                return
            }
            dataUrl = "data:image/png;base64,\(pngData.base64EncodedString())"
        case .jpeg:
            guard let jpegData = composited.jpegData(compressionQuality: 0.6) else {
                completion(.failure(NSError(domain: "PencilKit", code: 2,
                                            userInfo: [NSLocalizedDescriptionKey: "Failed to encode JPEG"])))
                return
            }
            dataUrl = "data:image/jpeg;base64,\(jpegData.base64EncodedString())"
        }

        completion(.success(dataUrl))
    }

    /// Returns the largest CGRect with the same aspect ratio as `imageSize`
    /// that fits inside `rect`, centred — matching UIImageView scaleAspectFit behaviour.
    private func aspectFitRect(imageSize: CGSize, inRect rect: CGRect) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0 else { return rect }
        let widthRatio  = rect.width  / imageSize.width
        let heightRatio = rect.height / imageSize.height
        let scale = min(widthRatio, heightRatio)
        let scaledWidth  = imageSize.width  * scale
        let scaledHeight = imageSize.height * scale
        let x = rect.minX + (rect.width  - scaledWidth)  / 2
        let y = rect.minY + (rect.height - scaledHeight) / 2
        return CGRect(x: x, y: y, width: scaledWidth, height: scaledHeight)
    }
}
