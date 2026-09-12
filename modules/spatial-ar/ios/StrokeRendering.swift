import RealityKit
import UIKit
import simd

enum StrokeColor {
  static func uiColor(from hex: String) -> UIColor {
    var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.hasPrefix("#") {
      value.removeFirst()
    }
    if value.count == 3 {
      value = value.map { "\($0)\($0)" }.joined()
    }

    var packed: UInt64 = 0
    Scanner(string: value).scanHexInt64(&packed)

    if value.count == 8 {
      let alpha = CGFloat((packed >> 24) & 0xff) / 255
      let red = CGFloat((packed >> 16) & 0xff) / 255
      let green = CGFloat((packed >> 8) & 0xff) / 255
      let blue = CGFloat(packed & 0xff) / 255
      return UIColor(red: red, green: green, blue: blue, alpha: alpha)
    }

    let red = CGFloat((packed >> 16) & 0xff) / 255
    let green = CGFloat((packed >> 8) & 0xff) / 255
    let blue = CGFloat(packed & 0xff) / 255
    return UIColor(red: red, green: green, blue: blue, alpha: 1)
  }
}

enum StrokeRendering {
  static func clampedWidth(_ widthM: Float) -> Float {
    min(SpatialARMetrics.renderWidthMax, max(SpatialARMetrics.renderWidthMin, widthM))
  }

  static func material(hex: String) -> UnlitMaterial {
    UnlitMaterial(color: StrokeColor.uiColor(from: hex))
  }

  static func makeStrokeEntity(id: String, stroke: SpatialARStroke) -> Entity {
    let entity = Entity()
    entity.name = "stroke:\(id)"
    let material = material(hex: stroke.color)
    let radius = clampedWidth(stroke.widthM) / 2
    append(points: stroke.points, to: entity, radius: radius, material: material)
    return entity
  }

  static func appendPoint(
    _ point: SIMD3<Float>,
    previous: SIMD3<Float>?,
    to entity: Entity,
    widthM: Float,
    color: String
  ) {
    let material = material(hex: color)
    let radius = clampedWidth(widthM) / 2
    entity.addChild(sphere(at: point, radius: radius, material: material))
    if let previous, let segment = segment(from: previous, to: point, radius: radius, material: material) {
      entity.addChild(segment)
    }
  }

  static func append(
    points: [SIMD3<Float>],
    to entity: Entity,
    radius: Float,
    material: UnlitMaterial
  ) {
    var previous: SIMD3<Float>?
    for point in points {
      entity.addChild(sphere(at: point, radius: radius, material: material))
      if let previous, let segment = segment(from: previous, to: point, radius: radius, material: material) {
        entity.addChild(segment)
      }
      previous = point
    }
  }

  private static func sphere(at point: SIMD3<Float>, radius: Float, material: UnlitMaterial) -> ModelEntity {
    let mesh = MeshResource.generateSphere(radius: radius)
    let entity = ModelEntity(mesh: mesh, materials: [material])
    entity.position = point
    return entity
  }

  private static func segment(
    from start: SIMD3<Float>,
    to end: SIMD3<Float>,
    radius: Float,
    material: UnlitMaterial
  ) -> ModelEntity? {
    let delta = end - start
    let height = simd_length(delta)
    if height < 0.0004 || !height.isFinite {
      return nil
    }
    guard let direction = RayPlane.safeNormalize(delta) else {
      return nil
    }

    let mesh = MeshResource.generateBox(width: radius * 2, height: height, depth: radius * 2)
    let entity = ModelEntity(mesh: mesh, materials: [material])
    entity.position = (start + end) / 2
    entity.orientation = rotation(from: SIMD3<Float>(0, 1, 0), to: direction)
    return entity
  }

  private static func rotation(from: SIMD3<Float>, to: SIMD3<Float>) -> simd_quatf {
    guard let source = RayPlane.safeNormalize(from), let destination = RayPlane.safeNormalize(to) else {
      return simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
    }
    let cosine = simd_dot(source, destination)
    if cosine > 0.9999 {
      return simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
    }
    if cosine < -0.9999 {
      let axis = abs(source.x) < 0.9
        ? simd_normalize(simd_cross(source, SIMD3<Float>(1, 0, 0)))
        : simd_normalize(simd_cross(source, SIMD3<Float>(0, 1, 0)))
      return simd_quatf(angle: .pi, axis: axis)
    }
    return simd_quatf(from: source, to: destination)
  }
}
