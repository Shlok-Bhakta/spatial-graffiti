import ARKit
import Foundation
import simd

enum SpatialARMetrics {
  static let surfaceMaxDistance: Float = 1.0
  static let airDistance: Float = 1.5
  static let zFightOffset: Float = 0.005
  static let minPointSpacing: Float = 0.008
  static let maxPoints = 2048
  static let strokeWidth: Float = 0.01
  static let renderWidthMin: Float = 0.008
  static let renderWidthMax: Float = 0.012
}

enum SpatialARMode: String {
  case starting
  case newSite
  case relocalizing
  case ready
  case failed
}

struct SpatialARStatus: Equatable {
  var tracking = "notAvailable"
  var trackingReason: String?
  var mapping = "notAvailable"
  var mode = SpatialARMode.starting.rawValue
  var siteId: String?
  var rootAnchorReady = false

  func dictionary() -> [String: Any] {
    var payload: [String: Any] = [
      "tracking": tracking,
      "mapping": mapping,
      "mode": mode,
      "rootAnchorReady": rootAnchorReady,
    ]
    if let trackingReason {
      payload["trackingReason"] = trackingReason
    }
    if let siteId {
      payload["siteId"] = siteId
    }
    return payload
  }
}

struct SpatialARStroke: Equatable {
  var id: String
  var siteId: String
  var color: String
  var widthM: Float
  var points: [SIMD3<Float>]
  var createdAt: String

  func dictionary() -> [String: Any] {
    [
      "id": id,
      "siteId": siteId,
      "color": color,
      "widthM": Double(widthM),
      "points": points.map { [Double($0.x), Double($0.y), Double($0.z)] },
      "createdAt": createdAt,
    ]
  }

  func matchesGeometry(_ other: SpatialARStroke) -> Bool {
    id == other.id
      && siteId == other.siteId
      && color == other.color
      && abs(widthM - other.widthM) < 0.0001
      && points.count == other.points.count
      && zip(points, other.points).allSatisfy { simd_distance($0, $1) < 0.0005 }
  }
}

struct FrozenPlane {
  var point: SIMD3<Float>
  var normal: SIMD3<Float>
}

enum SpatialARError: LocalizedError {
  case cameraDenied
  case unsupported
  case noRootAnchor
  case worldMapInvalid(String)
  case exportFailed(String)

  var errorDescription: String? {
    switch self {
    case .cameraDenied:
      return "Camera access is required for Spatial Graffiti"
    case .unsupported:
      return "ARKit world tracking is not available on this device"
    case .noRootAnchor:
      return "The site root anchor is not ready"
    case .worldMapInvalid(let message):
      return message
    case .exportFailed(let message):
      return message
    }
  }
}

enum SpatialARMapping {
  static func tracking(from state: ARCamera.TrackingState) -> (String, String?) {
    switch state {
    case .notAvailable:
      return ("notAvailable", nil)
    case .normal:
      return ("normal", nil)
    case .limited(let reason):
      let reasonString: String
      switch reason {
      case .initializing:
        reasonString = "initializing"
      case .excessiveMotion:
        reasonString = "excessiveMotion"
      case .insufficientFeatures:
        reasonString = "insufficientFeatures"
      case .relocalizing:
        reasonString = "relocalizing"
      @unknown default:
        reasonString = "unknown"
      }
      return ("limited", reasonString)
    }
  }

  static func mapping(from status: ARFrame.WorldMappingStatus) -> String {
    switch status {
    case .notAvailable:
      return "notAvailable"
    case .limited:
      return "limited"
    case .extending:
      return "extending"
    case .mapped:
      return "mapped"
    @unknown default:
      return "notAvailable"
    }
  }

  static func isUsableForNewRoot(tracking: String, reason: String?) -> Bool {
    tracking == "normal"
  }
}

enum SpatialARISO {
  static let formatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  static func now() -> String {
    formatter.string(from: Date())
  }
}
