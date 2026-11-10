'use strict';

// Compatibility helper for qrcode's segment optimizer, avoiding another bundled library.
function find_path(graph, start, end) {
  const distances = new Map([[start, 0]]);
  const parents = new Map();
  const pending = new Set([start]);
  const visited = new Set();
  while (pending.size) {
    let current;
    let distance = Infinity;
    for (const node of pending) {
      if (distances.get(node) < distance) {
        current = node;
        distance = distances.get(node);
      }
    }
    pending.delete(current);
    if (current === end) {
      const path = [end];
      while (path[0] !== start) path.unshift(parents.get(path[0]));
      return path;
    }
    visited.add(current);
    for (const [next, weight] of Object.entries(graph[current] || {})) {
      if (!Number.isFinite(weight) || weight < 0) throw new Error('Expected a non-negative graph weight.');
      if (visited.has(next)) continue;
      const candidate = distance + weight;
      if (!distances.has(next) || candidate < distances.get(next)) {
        distances.set(next, candidate);
        parents.set(next, current);
        pending.add(next);
      }
    }
  }
  throw new Error(`No path from ${start} to ${end}.`);
}

module.exports = { find_path };
