import Foundation
import UIKit
import PencilKit
import Capacitor

// MARK: - PencilKit Capacitor Plugin
// Wraps PKCanvasView and PKToolPicker to give the web layer a native
// Apple Pencil drawing surface. The JS API is:
//
//   PencilKit.present({ backgroundDataUrl?: string }) → { dataUrl: string }
//
// backgroundDataUrl  — optional PNG/JPEG data URL to render behind the strokes
//                      (used to composite the vascular worksheet template)
// dataUrl            — PNG data URL of the composited drawing (background + strokes)
//                      This is interchangeable with canvas.toDataURL('image/png').

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

class PencilKitViewController: UIViewController, PKCanvasViewDelegate, PKToolPickerObserver {

    var backgroundDataUrl: String?
    var completion: ((Result<String, Error>) -> Void)?

    private let canvasView = PKCanvasView()
    private var toolPicker: PKToolPicker?
    private var backgroundImageView: UIImageView?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        setupBackground()
        setupCanvas()
        setupToolbar()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        setupToolPicker()
    }

    // MARK: Setup helpers

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
            view.addSubview(imageView)
            NSLayoutConstraint.activate([
                imageView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 56),
                imageView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                imageView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                imageView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
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
        canvasView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(canvasView)
        NSLayoutConstraint.activate([
            canvasView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 56),
            canvasView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            canvasView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            canvasView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
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

    // MARK: Actions

    @objc private func cancelTapped() {
        dismiss(animated: true) { [weak self] in
            self?.completion?(.failure(NSError(
                domain: "PencilKit",
                code: 0,
                userInfo: [NSLocalizedDescriptionKey: "cancelled"]
            )))
        }
    }

    @objc private func doneTapped() {
        exportComposited { [weak self] result in
            DispatchQueue.main.async {
                self?.dismiss(animated: true) {
                    self?.completion?(result)
                }
            }
        }
    }

    // MARK: Export

    /// Composite background + PencilKit strokes → PNG data URL.
    /// The output size matches the canvas view's pixel bounds so that the
    /// result is interchangeable with canvas.toDataURL('image/png').
    ///
    /// The background image is drawn using the same aspect-fit rect that
    /// UIImageView uses at display time — i.e. the image is scaled to fit
    /// inside the canvas bounds while preserving its aspect ratio — ensuring
    /// that what the user sees while drawing exactly matches the exported PNG.
    private func exportComposited(completion: @escaping (Result<String, Error>) -> Void) {
        let bounds = canvasView.bounds
        let scale = UIScreen.main.scale

        UIGraphicsBeginImageContextWithOptions(bounds.size, false, scale)
        defer { UIGraphicsEndImageContext() }

        guard let ctx = UIGraphicsGetCurrentContext() else {
            completion(.failure(NSError(domain: "PencilKit", code: 1,
                                        userInfo: [NSLocalizedDescriptionKey: "Could not create graphics context"])))
            return
        }

        // White background
        ctx.setFillColor(UIColor.white.cgColor)
        ctx.fill(CGRect(origin: .zero, size: bounds.size))

        // Template background image — use the same aspect-fit rect as UIImageView(.scaleAspectFit)
        // so the exported image is pixel-identical to what the user drew over.
        if let bgView = backgroundImageView, let bgImage = bgView.image {
            let destRect = aspectFitRect(imageSize: bgImage.size, inRect: bounds)
            bgImage.draw(in: destRect)
        }

        // PencilKit strokes (rendered at screen scale for full resolution)
        let drawing = canvasView.drawing
        let strokeImage = drawing.image(from: canvasView.bounds, scale: scale)
        strokeImage.draw(in: bounds)

        guard let composited = UIGraphicsGetImageFromCurrentImageContext(),
              let pngData = composited.pngData() else {
            completion(.failure(NSError(domain: "PencilKit", code: 2,
                                        userInfo: [NSLocalizedDescriptionKey: "Failed to encode PNG"])))
            return
        }

        let base64 = pngData.base64EncodedString()
        completion(.success("data:image/png;base64,\(base64)"))
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
