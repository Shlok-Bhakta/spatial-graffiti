import ARKit
import Foundation

enum SpatialARWorldMapIO {
  static func resolveFileURL(_ uri: String) throws -> URL {
    let trimmed = uri.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty {
      throw SpatialARError.worldMapInvalid("World map path is empty")
    }

    if let url = URL(string: trimmed), let scheme = url.scheme?.lowercased() {
      if scheme == "file" {
        if url.path.isEmpty {
          throw SpatialARError.worldMapInvalid("World map file URL has no path")
        }
        return url
      }
    }

    if trimmed.hasPrefix("/") || trimmed.hasPrefix("~") {
      return URL(fileURLWithPath: (trimmed as NSString).expandingTildeInPath)
    }

    if let url = URL(string: trimmed), url.isFileURL {
      return url
    }

    return URL(fileURLWithPath: trimmed)
  }

  static func read(from uri: String) throws -> ARWorldMap {
    let url = try resolveFileURL(uri)
    let data: Data
    do {
      data = try Data(contentsOf: url)
    } catch {
      throw SpatialARError.worldMapInvalid("Could not read world map: \(error.localizedDescription)")
    }

    do {
      guard let worldMap = try NSKeyedUnarchiver.unarchivedObject(ofClass: ARWorldMap.self, from: data) else {
        throw SpatialARError.worldMapInvalid("World map file did not contain an ARWorldMap")
      }
      return worldMap
    } catch let error as SpatialARError {
      throw error
    } catch {
      throw SpatialARError.worldMapInvalid("Could not unarchive world map: \(error.localizedDescription)")
    }
  }

  static func write(_ worldMap: ARWorldMap, siteId: String?) throws -> String {
    let data: Data
    do {
      data = try NSKeyedArchiver.archivedData(withRootObject: worldMap, requiringSecureCoding: true)
    } catch {
      throw SpatialARError.exportFailed("Could not archive world map: \(error.localizedDescription)")
    }

    let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
      ?? FileManager.default.temporaryDirectory
    let site = siteId ?? "site"
    let filename = "spatial-graffiti-\(site)-\(UUID().uuidString).worldmap"
    let url = directory.appendingPathComponent(filename)

    do {
      try data.write(to: url, options: .atomic)
    } catch {
      throw SpatialARError.exportFailed("Could not write world map: \(error.localizedDescription)")
    }

    return url.absoluteString
  }
}
