import ARKit
import QuartzCore
import RealityKit

final class SpatialARController: NSObject, ARSessionDelegate {
  static let shared = SpatialARController()

  let session = ARSession()
  var currentColor = "#ff3b30"

  private weak var host: SpatialARViewHost?
  private var status = SpatialARStatus()
  private var lastEmittedStatus: SpatialARStatus?
  private var restoringWorldMap = false
  private var loadedWorldMap = false
  private var creatingRoot = false
  private var drawingEnabled = false

  private var rootAnchor: ARAnchor?
  private var rootEntity: Entity?
  private var sceneRoot: AnchorEntity?

  private var strokes: [String: SpatialARStroke] = [:]
  private var localStrokeIDs = Set<String>()
  private var remoteStrokeIDs = Set<String>()
  private var strokeEntities: [String: Entity] = [:]

  private var activeStroke: SpatialARStroke?
  private var activeStrokeEntity: Entity?
  private var frozenPlane: FrozenPlane?
  private var lastScreenPoint: CGPoint?
  private var displayLink: CADisplayLink?
  private var lastMapping: ARFrame.WorldMappingStatus?

  private override init() {
    super.init()
    session.delegate = self
  }

  func register(view: SpatialARViewHost) {
    host = view
    view.arView.automaticallyConfigureSession = false
    view.arView.session = session
    attachRootEntityIfNeeded()
    renderAllStrokes()
    emitStatus(force: true)
  }

  func unregister(view: SpatialARViewHost) {
    if host === view {
      cancelActiveStroke(keep: false)
      host = nil
      rootEntity = nil
      sceneRoot = nil
      strokeEntities.removeAll()
      activeStrokeEntity = nil
    }
  }

  func startNewSite(siteId: String, cameraGranted: Bool) throws {
    beginFreshSession()
    status.siteId = siteId
    if !cameraGranted {
      fail("Camera access is required for Spatial Graffiti")
      throw SpatialARError.cameraDenied
    }
    if !ARWorldTrackingConfiguration.isSupported {
      fail("ARKit world tracking is not available on this device")
      throw SpatialARError.unsupported
    }
    status.mode = SpatialARMode.newSite.rawValue
    runWorldTracking(worldMap: nil)
    emitIfChanged()
  }

  func startDiscovery(cameraGranted: Bool) throws {
    beginFreshSession()
    if !cameraGranted {
      fail("Camera access is required for room discovery")
      throw SpatialARError.cameraDenied
    }
    guard ARWorldTrackingConfiguration.isSupported else {
      throw SpatialARError.unsupported
    }
    runWorldTracking(worldMap: nil)
    emitIfChanged()
  }

  func loadSite(siteId: String, worldMap: ARWorldMap, cameraGranted: Bool) throws {
    beginFreshSession()
    status.siteId = siteId
    if !cameraGranted {
      fail("Camera access is required for Spatial Graffiti")
      throw SpatialARError.cameraDenied
    }
    if !ARWorldTrackingConfiguration.isSupported {
      fail("ARKit world tracking is not available on this device")
      throw SpatialARError.unsupported
    }
    restoringWorldMap = true
    loadedWorldMap = true
    status.mode = SpatialARMode.relocalizing.rawValue
    runWorldTracking(worldMap: worldMap)
    emitIfChanged()
  }

  func resetSession() {
    beginFreshSession()
    status.mode = SpatialARMode.starting.rawValue
    emitIfChanged()
  }

  func setDrawingEnabled(_ enabled: Bool) {
    drawingEnabled = enabled && status.mode == SpatialARMode.ready.rawValue
    status.drawingEnabled = drawingEnabled
    emitIfChanged()
  }

  func captureFeaturePrint() throws -> String {
    guard let frame = Isolation.onMain({ self.session.currentFrame }) else {
      throw SpatialARError.featurePrintFailed("The camera has not produced a frame yet")
    }
    return try SpatialARVision.capture(frame: frame)
  }

  func fail(_ message: String) {
    cancelActiveStroke(keep: false)
    session.pause()
    status.mode = SpatialARMode.failed.rawValue
    status.trackingReason = message
    emitIfChanged()
  }

  func setRemoteStrokes(_ incoming: [SpatialARStroke]) {
    remoteStrokeIDs = Set(incoming.map(\.id))
    for stroke in incoming where !stroke.id.isEmpty {
      let previous = strokes[stroke.id]
      strokes[stroke.id] = stroke
      if let previous, previous.matchesGeometry(stroke), strokeEntities[stroke.id] != nil {
        continue
      }
      if rootEntity != nil {
        rebuildStrokeEntity(stroke)
      }
    }
    let staleIDs = strokes.keys.filter { id in
      !remoteStrokeIDs.contains(id) && !localStrokeIDs.contains(id)
    }
    for id in staleIDs {
      strokes.removeValue(forKey: id)
      strokeEntities[id]?.removeFromParent()
      strokeEntities.removeValue(forKey: id)
    }
  }

  func debugState() -> [String: Any] {
    var payload = status.dictionary()
    payload["strokeCount"] = strokes.count
    payload["hasWorldMap"] = hasWorldMap
    return payload
  }

  func exportWorldMap() async throws -> String {
    let snapshot = Isolation.onMain { () -> (ARSession, String?, Bool, String?) in
      (
        self.session,
        self.status.siteId,
        self.status.rootAnchorReady && self.rootAnchor != nil,
        self.rootAnchorName()
      )
    }
    guard snapshot.2 else {
      throw SpatialARError.noRootAnchor
    }

    let worldMap = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<ARWorldMap, Error>) in
      snapshot.0.getCurrentWorldMap { map, error in
        if let map {
          continuation.resume(returning: map)
        } else {
          continuation.resume(
            throwing: SpatialARError.exportFailed(
              error?.localizedDescription ?? "ARKit did not return a world map"
            )
          )
        }
      }
    }

    if let name = snapshot.3, !worldMap.anchors.contains(where: { $0.name == name }) {
      throw SpatialARError.exportFailed("World map is missing the site root anchor")
    }

    return try SpatialARWorldMapIO.write(worldMap, siteId: snapshot.1)
  }

  func beginStroke(at point: CGPoint) {
    guard canDraw, frozenPlane == nil, let plane = choosePlane(at: point) else {
      return
    }
    guard let siteId = status.siteId else {
      return
    }
    guard let firstPoint = samplePlane(at: point, plane: plane) else {
      return
    }

    frozenPlane = plane
    lastScreenPoint = point
    let stroke = SpatialARStroke(
      id: UUID().uuidString.lowercased(),
      siteId: siteId,
      color: currentColor,
      widthM: SpatialARMetrics.strokeWidth,
      points: [firstPoint],
      createdAt: SpatialARISO.now()
    )
    activeStroke = stroke
    let entity = Entity()
    entity.name = "stroke:\(stroke.id)"
    StrokeRendering.appendPoint(
      firstPoint,
      previous: nil,
      to: entity,
      widthM: stroke.widthM,
      color: stroke.color
    )
    rootEntity?.addChild(entity)
    activeStrokeEntity = entity
    startDisplayLink()
  }

  func moveStroke(at point: CGPoint) {
    lastScreenPoint = point
    sampleActiveStroke(at: point)
  }

  func cancelStroke() {
    cancelActiveStroke(keep: false)
  }

  func endStroke() {
    stopDisplayLink()
    lastScreenPoint = nil
    frozenPlane = nil
    guard let stroke = activeStroke else {
      return
    }
    activeStroke = nil
    let entity = activeStrokeEntity
    activeStrokeEntity = nil

    if stroke.points.isEmpty {
      entity?.removeFromParent()
      return
    }

    strokes[stroke.id] = stroke
    localStrokeIDs.insert(stroke.id)
    if let entity {
      strokeEntities[stroke.id] = entity
    }
    host?.emitStroke(stroke.dictionary())
  }

  // MARK: - Session

  private func beginFreshSession() {
    cancelActiveStroke(keep: false)
    restoringWorldMap = false
    loadedWorldMap = false
    creatingRoot = false
    drawingEnabled = false
    rootAnchor = nil
    rootEntity?.removeFromParent()
    rootEntity = nil
    sceneRoot?.removeFromParent()
    sceneRoot = nil
    strokes.removeAll()
    localStrokeIDs.removeAll()
    remoteStrokeIDs.removeAll()
    for entity in strokeEntities.values {
      entity.removeFromParent()
    }
    strokeEntities.removeAll()

    if let currentAnchors = session.currentFrame?.anchors {
      for anchor in currentAnchors {
        session.remove(anchor: anchor)
      }
    }
    if let arView = host?.arView {
      while let anchor = arView.scene.anchors.first {
        arView.scene.removeAnchor(anchor)
      }
    }
    session.pause()
    lastMapping = nil

    status.tracking = "notAvailable"
    status.trackingReason = nil
    status.mapping = "notAvailable"
    status.mode = SpatialARMode.starting.rawValue
    status.siteId = nil
    status.rootAnchorReady = false
    status.drawingEnabled = false
    lastEmittedStatus = nil
  }

  private func runWorldTracking(worldMap: ARWorldMap?) {
    let configuration = ARWorldTrackingConfiguration()
    configuration.planeDetection = [.horizontal, .vertical]
    configuration.environmentTexturing = .none
    configuration.worldAlignment = .gravity
    if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
      configuration.sceneReconstruction = .mesh
    }
    if let worldMap {
      configuration.initialWorldMap = worldMap
    }
    session.delegate = self
    session.run(configuration, options: [.resetTracking, .removeExistingAnchors, .resetSceneReconstruction])
  }

  private var hasWorldMap: Bool {
    loadedWorldMap || status.mapping == "extending" || status.mapping == "mapped"
  }

  private var canDraw: Bool {
    status.mode == SpatialARMode.ready.rawValue && status.rootAnchorReady && rootAnchor != nil && drawingEnabled
  }

  private func rootAnchorName() -> String? {
    guard let siteId = status.siteId else {
      return nil
    }
    return "spatial-graffiti-root:\(siteId)"
  }

  private func currentRootTransform() -> simd_float4x4? {
    guard let rootAnchor else {
      return nil
    }
    if let live = session.currentFrame?.anchors.first(where: { $0.identifier == rootAnchor.identifier }) {
      return live.transform
    }
    return rootAnchor.transform
  }

  // MARK: - Root

  private func tryCreateNewRoot() {
    guard status.mode == SpatialARMode.newSite.rawValue, !status.rootAnchorReady, !creatingRoot else {
      return
    }
    guard SpatialARMapping.isUsableForNewRoot(tracking: status.tracking, reason: status.trackingReason) else {
      return
    }
    guard let name = rootAnchorName() else {
      return
    }
    guard let transform = session.currentFrame?.camera.transform else {
      return
    }

    creatingRoot = true
    let anchor = ARAnchor(name: name, transform: transform)
    session.add(anchor: anchor)
    attachRoot(anchor)
    status.mode = SpatialARMode.ready.rawValue
    emitIfChanged()
  }

  private func tryResolveRestoredRoot() {
    guard status.mode == SpatialARMode.relocalizing.rawValue, !status.rootAnchorReady else {
      return
    }
    guard let name = rootAnchorName() else {
      return
    }
    let anchors = session.currentFrame?.anchors ?? []
    if let match = anchors.first(where: { $0.name == name }) {
      attachRoot(match)
    }
    tryFinishRelocalization()
  }

  private func tryFinishRelocalization() {
    guard status.mode == SpatialARMode.relocalizing.rawValue else {
      return
    }
    guard status.rootAnchorReady, status.tracking == "normal" else {
      return
    }
    status.mode = SpatialARMode.ready.rawValue
    renderAllStrokes()
    emitIfChanged()
  }

  private func attachRoot(_ anchor: ARAnchor) {
    rootAnchor = anchor
    status.rootAnchorReady = true
    attachRootEntityIfNeeded()
    renderAllStrokes()
  }

  private func attachRootEntityIfNeeded() {
    guard let host, let rootAnchor else {
      return
    }
    if sceneRoot == nil {
      let anchorEntity = AnchorEntity(anchor: rootAnchor)
      host.arView.scene.addAnchor(anchorEntity)
      let content = Entity()
      content.name = "spatial-graffiti-root-content"
      anchorEntity.addChild(content)
      sceneRoot = anchorEntity
      rootEntity = content
    }
  }

  // MARK: - Drawing

  private func choosePlane(at point: CGPoint) -> FrozenPlane? {
    guard let arView = host?.arView, let root = currentRootTransform() else {
      return nil
    }
    guard let cameraTransform = session.currentFrame?.camera.transform else {
      return nil
    }
    let camera = cameraTransform.translation

    if let hit = nearestSurfaceHit(in: arView, at: point, camera: camera) {
      let worldPoint = hit.worldTransform.translation
      var normal = SIMD3<Float>(
        hit.worldTransform.columns.1.x,
        hit.worldTransform.columns.1.y,
        hit.worldTransform.columns.1.z
      )
      normal = RayPlane.facingCamera(normal: normal, from: worldPoint, camera: camera)
      let offset = worldPoint + normal * SpatialARMetrics.zFightOffset
      return FrozenPlane(
        point: root.inverse.transformPoint(offset),
        normal: root.inverse.transformDirection(normal)
      )
    }

    let forward = cameraTransform.cameraForward
    let center = camera + forward * SpatialARMetrics.airDistance
    let normal = RayPlane.facingCamera(normal: -forward, from: center, camera: camera)
    return FrozenPlane(
      point: root.inverse.transformPoint(center),
      normal: root.inverse.transformDirection(normal)
    )
  }

  private func nearestSurfaceHit(
    in arView: ARView,
    at point: CGPoint,
    camera: SIMD3<Float>
  ) -> ARRaycastResult? {
    let targets: [ARRaycastQuery.Target] = [
      .existingPlaneGeometry,
      .existingPlaneInfinite,
      .estimatedPlane,
    ]
    var best: (ARRaycastResult, Float)?
    for target in targets {
      for result in arView.raycast(from: point, allowing: target, alignment: .any) {
        let distance = simd_length(result.worldTransform.translation - camera)
        if distance > 0, distance <= SpatialARMetrics.surfaceMaxDistance {
          if best == nil || distance < best!.1 {
            best = (result, distance)
          }
        }
      }
    }
    return best?.0
  }

  private func samplePlane(at point: CGPoint, plane: FrozenPlane) -> SIMD3<Float>? {
    guard let arView = host?.arView, let root = currentRootTransform() else {
      return nil
    }
    guard let ray = arView.ray(through: point),
          let direction = RayPlane.safeNormalize(ray.direction)
    else {
      return nil
    }
    let localOrigin = root.inverse.transformPoint(ray.origin)
    let localDirection = root.inverse.transformDirection(direction)
    return RayPlane.intersect(
      origin: localOrigin,
      direction: localDirection,
      planePoint: plane.point,
      planeNormal: plane.normal
    )
  }

  private func sampleActiveStroke(at point: CGPoint) {
    guard var stroke = activeStroke, let plane = frozenPlane else {
      return
    }
    guard stroke.points.count < SpatialARMetrics.maxPoints else {
      return
    }
    guard let next = samplePlane(at: point, plane: plane) else {
      return
    }
    if let last = stroke.points.last, simd_distance(last, next) < SpatialARMetrics.minPointSpacing {
      return
    }
    let previous = stroke.points.last
    stroke.points.append(next)
    activeStroke = stroke
    if let entity = activeStrokeEntity {
      StrokeRendering.appendPoint(
        next,
        previous: previous,
        to: entity,
        widthM: stroke.widthM,
        color: stroke.color
      )
    }
  }

  private func cancelActiveStroke(keep: Bool) {
    stopDisplayLink()
    lastScreenPoint = nil
    frozenPlane = nil
    if !keep {
      activeStrokeEntity?.removeFromParent()
    }
    activeStroke = nil
    activeStrokeEntity = nil
  }

  private func startDisplayLink() {
    stopDisplayLink()
    let link = CADisplayLink(target: self, selector: #selector(handleDrawTick))
    link.add(to: .main, forMode: .common)
    displayLink = link
  }

  private func stopDisplayLink() {
    displayLink?.invalidate()
    displayLink = nil
  }

  @objc private func handleDrawTick() {
    guard let lastScreenPoint else {
      return
    }
    sampleActiveStroke(at: lastScreenPoint)
  }

  // MARK: - Rendering

  private func renderAllStrokes() {
    guard rootEntity != nil else {
      return
    }
    for stroke in strokes.values where strokeEntities[stroke.id] == nil {
      rebuildStrokeEntity(stroke)
    }
  }

  private func rebuildStrokeEntity(_ stroke: SpatialARStroke) {
    guard let rootEntity else {
      return
    }
    strokeEntities[stroke.id]?.removeFromParent()
    let entity = StrokeRendering.makeStrokeEntity(id: stroke.id, stroke: stroke)
    rootEntity.addChild(entity)
    strokeEntities[stroke.id] = entity
  }

  // MARK: - Status

  private func applyTracking(_ tracking: ARCamera.TrackingState, mapping: ARFrame.WorldMappingStatus) {
    let mapped = SpatialARMapping.tracking(from: tracking)
    status.tracking = mapped.0
    status.trackingReason = mapped.1
    status.mapping = SpatialARMapping.mapping(from: mapping)

    if status.mode == SpatialARMode.newSite.rawValue {
      tryCreateNewRoot()
    } else if status.mode == SpatialARMode.relocalizing.rawValue {
      tryResolveRestoredRoot()
    }
    emitIfChanged()
  }

  private func emitIfChanged() {
    emitStatus(force: false)
  }

  private func emitStatus(force: Bool) {
    if !force, lastEmittedStatus == status {
      return
    }
    lastEmittedStatus = status
    host?.emitStatus(status.dictionary())
  }

  // MARK: - ARSessionDelegate

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    let tracking = frame.camera.trackingState
    let mapping = frame.worldMappingStatus
    let mappedTracking = SpatialARMapping.tracking(from: tracking)
    let mappedMapping = SpatialARMapping.mapping(from: mapping)
    if
      lastEmittedStatus?.tracking == mappedTracking.0,
      lastEmittedStatus?.trackingReason == mappedTracking.1,
      lastEmittedStatus?.mapping == mappedMapping,
      lastMapping == mapping
    {
      return
    }
    lastMapping = mapping
    DispatchQueue.main.async { [weak self] in
      self?.applyTracking(tracking, mapping: mapping)
    }
  }

  func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
    DispatchQueue.main.async { [weak self] in
      guard let self, let name = self.rootAnchorName() else {
        return
      }
      if let match = anchors.first(where: { $0.name == name }) {
        self.attachRoot(match)
        self.tryFinishRelocalization()
        self.emitIfChanged()
      }
    }
  }

  func session(_ session: ARSession, didFailWithError error: Error) {
    DispatchQueue.main.async { [weak self] in
      self?.fail(error.localizedDescription)
    }
  }

  func sessionShouldAttemptRelocalization(_ session: ARSession) -> Bool {
    restoringWorldMap
  }
}
