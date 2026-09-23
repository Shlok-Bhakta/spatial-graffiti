import { replayJournal } from './journalState';

test('replays a room and unsent drawing after a killed app', () => {
  const site = { id: 'room-1', latitude: 1, longitude: 2, horizontalAccuracyM: 8, createdAt: 'today' };
  const stroke = { id: 'stroke-1', siteId: site.id, color: '#ff0000', widthM: 0.01, points: [[0, 0, 0] as [number, number, number]], createdAt: 'today' };
  const text = [
    JSON.stringify({ type: 'site', site, published: false }),
    JSON.stringify({ type: 'active', siteId: site.id }),
    JSON.stringify({ type: 'map', siteId: site.id, uri: 'file:///room.worldmap' }),
    JSON.stringify({ type: 'stroke', stroke }),
    '{"type":"strokeSynced",',
  ].join('\n');
  const { state, validLines } = replayJournal(text);
  expect(state.activeSiteId).toBe(site.id);
  expect(state.sites[site.id].mapUri).toBe('file:///room.worldmap');
  expect(state.strokes[stroke.id].synced).toBe(false);
  expect(validLines).toHaveLength(4);
});
