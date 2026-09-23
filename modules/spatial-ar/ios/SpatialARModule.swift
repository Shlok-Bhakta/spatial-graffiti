import ARKit
import AVFoundation
import ExpoModulesCore
import simd

public class SpatialARModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SpatialAR")

    View(SpatialARView.self) {
      Events("onStatusChange", "onStrokeCompleted")
      Prop("color") { (view: SpatialARView, color: String) in
        view.strokeColor = color
      }
    }

    AsyncFunction("startNewSite") { (siteId: String) in
      let granted = await Isolation.requestCamera()
      try Isolation.onMain {
        try SpatialARController.shared.startNewSite(siteId: siteId, cameraGranted: granted)
      }
    }

    AsyncFunction("startDiscovery") {
      let granted = await Isolation.requestCamera()
      try Isolation.onMain {
        try SpatialARController.shared.startDiscovery(cameraGranted: granted)
      }
    }

    AsyncFunction("captureFeaturePrint") { () -> String in
      try SpatialARController.shared.captureFeaturePrint()
    }

    AsyncFunction("compareFeaturePrints") { (first: String, second: String) -> Double in
      try SpatialARVision.distance(first: first, second: second)
    }

    AsyncFunction("setDrawingEnabled") { (enabled: Bool) in
      Isolation.onMain {
        SpatialARController.shared.setDrawingEnabled(enabled)
      }
    }

    AsyncFunction("loadSite") { (siteId: String, worldMapFileUri: String) in
      let granted = await Isolation.requestCamera()
      let worldMap: ARWorldMap
      do {
        worldMap = try SpatialARWorldMapIO.read(from: worldMapFileUri)
      } catch {
        Isolation.onMain {
          SpatialARController.shared.resetSession()
          SpatialARController.shared.fail("Could not load world map")
        }
        throw error
      }
      try Isolation.onMain {
        try SpatialARController.shared.loadSite(
          siteId: siteId,
          worldMap: worldMap,
          cameraGranted: granted
        )
      }
    }

    AsyncFunction("exportWorldMap") { () -> String in
      try await SpatialARController.shared.exportWorldMap()
    }

    AsyncFunction("setRemoteStrokes") { (strokes: [StrokeRecord]) in
      Isolation.onMain {
        SpatialARController.shared.setRemoteStrokes(strokes.map { $0.toStroke() })
      }
    }

    AsyncFunction("getDebugState") { () -> [String: Any] in
      Isolation.onMain {
        SpatialARController.shared.debugState()
      }
    }

    AsyncFunction("resetSession") {
      Isolation.onMain {
        SpatialARController.shared.resetSession()
      }
    }
  }
}

struct StrokeRecord: Record {
  @Field var id: String = ""
  @Field var siteId: String = ""
  @Field var color: String = "#ffffff"
  @Field var widthM: Double = 0.01
  @Field var points: [[Double]] = []
  @Field var createdAt: String = ""

  func toStroke() -> SpatialARStroke {
    SpatialARStroke(
      id: id,
      siteId: siteId,
      color: color,
      widthM: Float(widthM > 0 ? widthM : Double(SpatialARMetrics.strokeWidth)),
      points: points.compactMap { pair in
        guard pair.count >= 3 else {
          return nil
        }
        return SIMD3(Float(pair[0]), Float(pair[1]), Float(pair[2]))
      },
      createdAt: createdAt
    )
  }
}

enum Isolation {
  static func onMain<T>(_ work: @MainActor () throws -> T) rethrows -> T {
    if Thread.isMainThread {
      return try MainActor.assumeIsolated(work)
    }
    return try DispatchQueue.main.sync {
      try MainActor.assumeIsolated(work)
    }
  }

  static func requestCamera() async -> Bool {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      return true
    case .notDetermined:
      return await AVCaptureDevice.requestAccess(for: .video)
    default:
      return false
    }
  }
}
