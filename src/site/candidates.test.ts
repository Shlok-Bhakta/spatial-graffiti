import type { NearbySite } from '@/types';

import { rankCandidates } from './candidates';

const site = (id: string, distanceM: number): NearbySite => ({
  id, distanceM, latitude: 1, longitude: 2, horizontalAccuracyM: 10, createdAt: 'today',
});

test('visual evidence outranks indistinguishable GPS distances', () => {
  const rooms = [site('wrong', 0.1), site('right', 0.2)];
  expect(rankCandidates(rooms, { wrong: 12, right: 3 }, 'wrong').map((room) => room.id))
    .toEqual(['right', 'wrong']);
});

test('last room wins when older rooms have no visual descriptor', () => {
  const rooms = [site('near', 0.1), site('recent', 0.2)];
  expect(rankCandidates(rooms, {}, 'recent').map((room) => room.id))
    .toEqual(['recent', 'near']);
});
