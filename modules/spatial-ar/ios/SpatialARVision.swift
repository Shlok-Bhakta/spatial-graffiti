import ARKit
import Foundation
import ImageIO
import Vision

// Coarse visual retrieval ranks GPS-nearby rooms. ARKit still performs the
// final six degree of freedom relocalization against each room's ARWorldMap.
enum SpatialARVision {
  static func capture(frame: ARFrame) throws -> String {
    let request = VNGenerateImageFeaturePrintRequest()
    request.revision = VNGenerateImageFeaturePrintRequestRevision1
    let handler = VNImageRequestHandler(
      cvPixelBuffer: frame.capturedImage,
      orientation: .right,
      options: [:]
    )
    do {
      try handler.perform([request])
      guard let print = request.results?.first else {
        throw SpatialARError.featurePrintFailed("Vision did not return a feature print")
      }
      let archive = try NSKeyedArchiver.archivedData(withRootObject: print, requiringSecureCoding: true)
      return archive.base64EncodedString()
    } catch let error as SpatialARError {
      throw error
    } catch {
      throw SpatialARError.featurePrintFailed(error.localizedDescription)
    }
  }

  static func distance(first: String, second: String) throws -> Double {
    guard let firstData = Data(base64Encoded: first),
          let secondData = Data(base64Encoded: second),
          let firstPrint = try NSKeyedUnarchiver.unarchivedObject(
            ofClass: VNFeaturePrintObservation.self, from: firstData
          ),
          let secondPrint = try NSKeyedUnarchiver.unarchivedObject(
            ofClass: VNFeaturePrintObservation.self, from: secondData
          )
    else {
      throw SpatialARError.featurePrintFailed("A room feature print is invalid")
    }
    var result: Float = 0
    try firstPrint.computeDistance(&result, to: secondPrint)
    guard result.isFinite else {
      throw SpatialARError.featurePrintFailed("Vision returned an invalid distance")
    }
    return Double(result)
  }
}
