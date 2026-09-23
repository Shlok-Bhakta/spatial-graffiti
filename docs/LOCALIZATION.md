# How room recovery works

GPS finds rooms within 200 m. It cannot tell adjacent rooms apart. The app now ranks nearby rooms with camera feature prints, then lets ARKit align against the selected room's saved `ARWorldMap`. If alignment stalls, the person holding the phone can choose a different room. The app does not create a new room merely because a 35 second alignment attempt timed out.

This follows the coarse retrieval, precise localization pattern in [Sarlin et al., CVPR 2019](https://openaccess.thecvf.com/content_CVPR_2019/papers/Sarlin_From_Coarse_to_Fine_Robust_Hierarchical_Localization_at_Large_Scale_CVPR_2019_paper.pdf). We use Apple's Vision feature prints for retrieval instead of the paper's learned image descriptors. ARKit handles final alignment instead of the paper's feature matching and pose solver. Vision feature prints are observations with a supported distance operation, as described in [Apple's Vision documentation](https://developer.apple.com/documentation/vision/vnfeatureprintobservation). The server stores feature prints, not camera photos.

One feature print is recorded when a room first maps, with up to four more while the phone stays in the room. Older rooms without prints still work. The last room is tried first when visual evidence is unavailable. A match is only a suggestion: ARKit must still report normal tracking with the saved root anchor before strokes appear or drawing unlocks.

[Apple's ARKit guidance](https://developer.apple.com/documentation/arkit/managing-session-life-cycle-and-tracking-quality) explains why alignment can take time and why the phone needs to see familiar walls and objects from a similar viewpoint. The app shows that instruction during alignment and offers an explicit room choice. Apple also recommends saving a world map when mapping quality is sufficient. New rooms save a checkpoint in the phone's Documents directory as soon as ARKit reaches `extending` or `mapped`; drawing unlocks after that file exists. The server receives a fresh map once ARKit reaches `mapped`. The server keeps earlier map versions, and the app can try those if its newest version cannot relocalize.

Each completed stroke enters an append-only journal in the phone's Documents directory before upload. The journal records the room ID, map path, strokes, and upload acknowledgments. Uploads retry with the same stroke IDs, so a retry cannot create a duplicate. A server outage leaves the room and its marks on the phone. If the app closes before ARKit can make any usable map, the app retains the mark data but cannot reliably place those 3D coordinates on a later launch. The UI says so instead of claiming they were saved globally.

## Physical acceptance test

1. In a textured, well-lit room, move the phone until drawing unlocks. Draw a stroke. Confirm the status says it is on the server, or says it is on the phone while offline.
2. Force quit and reopen from roughly the same viewpoint. Scan the same walls. The stroke must return at the same physical position.
3. Turn off the server after the room has mapped, draw again, force quit, reopen, and reconnect. The pending mark must upload once.
4. Create another room nearby. Reopen and confirm the camera ranks the correct room, and the room chooser can recover if it does not.
5. Use a second iPhone on the same server. It must align to the same map before showing the first phone's strokes.

The simulator can compile and exercise networking logic. It cannot prove physical alignment; that requires an iPhone.
