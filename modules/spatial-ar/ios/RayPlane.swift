import simd

enum RayPlane {
  static let epsilon: Float = 1e-6

  static func intersect(
    origin: SIMD3<Float>,
    direction: SIMD3<Float>,
    planePoint: SIMD3<Float>,
    planeNormal: SIMD3<Float>
  ) -> SIMD3<Float>? {
    let denominator = simd_dot(direction, planeNormal)
    if abs(denominator) < epsilon {
      return nil
    }

    let t = simd_dot(planePoint - origin, planeNormal) / denominator
    if t <= 0 || !t.isFinite {
      return nil
    }

    let hit = origin + direction * t
    if !hit.x.isFinite || !hit.y.isFinite || !hit.z.isFinite {
      return nil
    }
    return hit
  }

  static func facingCamera(
    normal: SIMD3<Float>,
    from point: SIMD3<Float>,
    camera: SIMD3<Float>
  ) -> SIMD3<Float> {
    var n = safeNormalize(normal) ?? SIMD3<Float>(0, 1, 0)
    let toCamera = camera - point
    if simd_dot(n, toCamera) < 0 {
      n = -n
    }
    return n
  }

  static func safeNormalize(_ vector: SIMD3<Float>) -> SIMD3<Float>? {
    let length = simd_length(vector)
    if length < epsilon || !length.isFinite {
      return nil
    }
    return vector / length
  }
}

extension simd_float4x4 {
  var translation: SIMD3<Float> {
    SIMD3(columns.3.x, columns.3.y, columns.3.z)
  }

  var cameraForward: SIMD3<Float> {
    RayPlane.safeNormalize(-SIMD3(columns.2.x, columns.2.y, columns.2.z))
      ?? SIMD3(0, 0, -1)
  }

  func transformPoint(_ point: SIMD3<Float>) -> SIMD3<Float> {
    let mapped = self * SIMD4<Float>(point.x, point.y, point.z, 1)
    return SIMD3(mapped.x, mapped.y, mapped.z)
  }

  func transformDirection(_ direction: SIMD3<Float>) -> SIMD3<Float> {
    let mapped = self * SIMD4<Float>(direction.x, direction.y, direction.z, 0)
    return RayPlane.safeNormalize(SIMD3(mapped.x, mapped.y, mapped.z))
      ?? SIMD3(mapped.x, mapped.y, mapped.z)
  }
}
