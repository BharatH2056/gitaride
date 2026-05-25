export interface GraphNode {
  name: string;
  lat: number;
  lng: number;
}

export interface Edge {
  to: string;
  weight: number; 
}

export const BANGALORE_NODES: Record<string, GraphNode> = {
  "Indiranagar": { name: "Indiranagar", lat: 12.9784, lng: 77.6408 },
  "Koramangala": { name: "Koramangala", lat: 12.9352, lng: 77.6245 },
  "MG Road": { name: "MG Road", lat: 12.9716, lng: 77.5946 },
  "HSR Layout": { name: "HSR Layout", lat: 12.9121, lng: 77.6446 },
  "BTM Layout": { name: "BTM Layout", lat: 12.9166, lng: 77.6101 },
  "Domlur": { name: "Domlur", lat: 12.9609, lng: 77.6387 },
  "Shivajinagar": { name: "Shivajinagar", lat: 12.9857, lng: 77.6057 },
  "Richmond Town": { name: "Richmond Town", lat: 12.9647, lng: 77.5971 },
  "Bellandur": { name: "Bellandur", lat: 12.9304, lng: 77.6784 },
  "Marathahalli": { name: "Marathahalli", lat: 12.9569, lng: 77.7011 }
};

export const BANGALORE_EDGES: Record<string, Edge[]> = {
  "Indiranagar": [{ to: "Koramangala", weight: 5 }, { to: "MG Road", weight: 4 }, { to: "Domlur", weight: 2 }, { to: "Shivajinagar", weight: 5 }, { to: "Marathahalli", weight: 8 }],
  "Koramangala": [{ to: "Indiranagar", weight: 5 }, { to: "HSR Layout", weight: 4 }, { to: "BTM Layout", weight: 3 }, { to: "Domlur", weight: 4 }, { to: "Richmond Town", weight: 6 }],
  "MG Road": [{ to: "Indiranagar", weight: 4 }, { to: "Shivajinagar", weight: 2 }, { to: "Richmond Town", weight: 3 }],
  "HSR Layout": [{ to: "Koramangala", weight: 4 }, { to: "BTM Layout", weight: 3 }, { to: "Bellandur", weight: 5 }],
  "BTM Layout": [{ to: "Koramangala", weight: 3 }, { to: "HSR Layout", weight: 3 }, { to: "Richmond Town", weight: 7 }],
  "Domlur": [{ to: "Indiranagar", weight: 2 }, { to: "Koramangala", weight: 4 }, { to: "Marathahalli", weight: 6 }],
  "Shivajinagar": [{ to: "MG Road", weight: 2 }, { to: "Indiranagar", weight: 5 }],
  "Richmond Town": [{ to: "MG Road", weight: 3 }, { to: "Koramangala", weight: 6 }, { to: "BTM Layout", weight: 7 }],
  "Bellandur": [{ to: "HSR Layout", weight: 5 }, { to: "Marathahalli", weight: 4 }],
  "Marathahalli": [{ to: "Domlur", weight: 6 }, { to: "Bellandur", weight: 4 }, { to: "Indiranagar", weight: 8 }]
};

export function findNearestNode(lat: number, lng: number): string {
  let nearest = "";
  let minDist = Infinity;
  for (const [key, node] of Object.entries(BANGALORE_NODES)) {
    // Simple Euclidean distance for mapping to nearest node
    const dist = Math.sqrt(Math.pow(node.lat - lat, 2) + Math.pow(node.lng - lng, 2));
    if (dist < minDist) {
      minDist = dist;
      nearest = key;
    }
  }
  return nearest;
}

export function dijkstraShortestPath(startNode: string, endNode: string): string[] {
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const unvisited = new Set<string>();

  for (const node of Object.keys(BANGALORE_NODES)) {
    distances[node] = Infinity;
    previous[node] = null;
    unvisited.add(node);
  }
  distances[startNode] = 0;

  while (unvisited.size > 0) {
    let currNode = null;
    let minDistance = Infinity;
    for (const node of unvisited) {
      if (distances[node] < minDistance) {
        minDistance = distances[node];
        currNode = node;
      }
    }

    if (currNode === null || minDistance === Infinity) break;
    if (currNode === endNode) break;

    unvisited.delete(currNode);

    for (const neighbor of BANGALORE_EDGES[currNode] || []) {
      if (!unvisited.has(neighbor.to)) continue;
      const alt = distances[currNode] + neighbor.weight;
      if (alt < distances[neighbor.to]) {
        distances[neighbor.to] = alt;
        previous[neighbor.to] = currNode;
      }
    }
  }

  const path: string[] = [];
  let current: string | null = endNode;
  while (current !== null) {
    path.unshift(current);
    current = previous[current];
  }

  if (path[0] === startNode) return path;
  return []; 
}

export function generateRouteCoordinates(start: {lat: number, lng: number}, end: {lat: number, lng: number}): {lat: number, lng: number}[] {
  const startNode = findNearestNode(start.lat, start.lng);
  const endNode = findNearestNode(end.lat, end.lng);
  
  if (startNode === endNode) {
    return [start, end];
  }
  
  const pathNodes = dijkstraShortestPath(startNode, endNode);
  if (pathNodes.length === 0) return [start, end]; 
  
  const route = [start];
  for (const node of pathNodes) {
    route.push({ lat: BANGALORE_NODES[node].lat, lng: BANGALORE_NODES[node].lng });
  }
  route.push(end);
  
  return route;
}
