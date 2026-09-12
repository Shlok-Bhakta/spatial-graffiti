import ExpoModulesCore
import RealityKit
import UIKit

protocol SpatialARViewHost: AnyObject {
  var arView: ARView { get }
  func emitStatus(_ payload: [String: Any])
  func emitStroke(_ payload: [String: Any])
}

final class SpatialARView: ExpoView, SpatialARViewHost {
  let onStatusChange = EventDispatcher()
  let onStrokeCompleted = EventDispatcher()
  let arView: ARView

  var strokeColor = "#ff3b30" {
    didSet {
      SpatialARController.shared.currentColor = strokeColor
    }
  }

  required init(appContext: AppContext? = nil) {
    arView = ARView(frame: .zero, cameraMode: .ar, automaticallyConfigureSession: false)
    super.init(appContext: appContext)

    backgroundColor = .black
    clipsToBounds = true
    isMultipleTouchEnabled = false

    arView.automaticallyConfigureSession = false
    arView.isUserInteractionEnabled = false
    arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    arView.renderOptions.insert(.disableMotionBlur)
    arView.renderOptions.insert(.disableDepthOfField)
    arView.renderOptions.insert(.disablePersonOcclusion)
    addSubview(arView)

    SpatialARController.shared.currentColor = strokeColor
    SpatialARController.shared.register(view: self)
  }

  deinit {
    SpatialARController.shared.unregister(view: self)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      SpatialARController.shared.register(view: self)
    } else {
      SpatialARController.shared.unregister(view: self)
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    arView.frame = bounds
  }

  func emitStatus(_ payload: [String: Any]) {
    onStatusChange(payload)
  }

  func emitStroke(_ payload: [String: Any]) {
    onStrokeCompleted(payload)
  }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let touch = touches.first else {
      return
    }
    SpatialARController.shared.beginStroke(at: touch.location(in: arView))
  }

  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let touch = touches.first else {
      return
    }
    SpatialARController.shared.moveStroke(at: touch.location(in: arView))
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let touch = touches.first else {
      SpatialARController.shared.endStroke()
      return
    }
    SpatialARController.shared.moveStroke(at: touch.location(in: arView))
    SpatialARController.shared.endStroke()
  }

  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
    SpatialARController.shared.endStroke()
  }
}
