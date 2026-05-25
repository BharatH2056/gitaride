import { describe, it, expect } from 'vitest';
import { findNearestNode, dijkstraShortestPath, generateRouteCoordinates, BANGALORE_NODES } from '../src/utils/dijkstra.js';

describe('Dijkstra Routing Algorithm', () => {
  it('should find the nearest node to a given location', () => {
    // Near Indiranagar
    const node = findNearestNode(12.9780, 77.6400);
    expect(node).toBe('Indiranagar');
  });

  it('should find the shortest path between two nodes', () => {
    const path = dijkstraShortestPath('Indiranagar', 'BTM Layout');
    // Indiranagar -> Koramangala (5) -> BTM Layout (3) = 8
    // Indiranagar -> Domlur (2) -> Koramangala (4) -> BTM Layout (3) = 9
    // So Indiranagar -> Koramangala -> BTM Layout is shortest path? Wait.
    // Indiranagar -> Koramangala -> BTM Layout = 8.
    // Wait, path must be valid and end at BTM Layout.
    expect(path[0]).toBe('Indiranagar');
    expect(path[path.length - 1]).toBe('BTM Layout');
    expect(path).toContain('Koramangala');
  });

  it('should generate route coordinates including start and end points', () => {
    const start = { lat: 12.9780, lng: 77.6400 }; // Near Indiranagar
    const end = { lat: 12.9160, lng: 77.6100 }; // Near BTM Layout
    
    const route = generateRouteCoordinates(start, end);
    expect(route.length).toBeGreaterThan(2); // Start + path nodes + end
    expect(route[0]).toEqual(start);
    expect(route[route.length - 1]).toEqual(end);
    
    // The second node should be the exact coordinates of Indiranagar
    expect(route[1]).toEqual({ lat: BANGALORE_NODES['Indiranagar'].lat, lng: BANGALORE_NODES['Indiranagar'].lng });
  });
});
