// The one rule. A parametric L-system with a single production:
//
//     X(n) : n > 0  →  F(n) [ X(n−1) ] [ X(n−2) ]
//
// Every segment F carries on (first bracket) and throws off a smaller side
// shoot (second bracket). Rewriting from X(ROOT) gives a Fibonacci-sized tree
// (F(ROOT+2) − 1 segments). Every form in the film is this same tree; only the
// angles, lengths and widths assigned to its segments change.

export const ROOT = 22;

type Sym = 'F' | 'X' | '[' | ']';
interface Mod {
  s: Sym;
  n: number;
}

export function rewrite(root = ROOT): Mod[] {
  let str: Mod[] = [{ s: 'X', n: root }];
  for (;;) {
    let changed = false;
    const out: Mod[] = [];
    for (const m of str) {
      if (m.s !== 'X') {
        out.push(m);
        continue;
      }
      changed = true;
      if (m.n > 0) {
        out.push(
          { s: 'F', n: m.n },
          { s: '[', n: 0 },
          { s: 'X', n: m.n - 1 },
          { s: ']', n: 0 },
          { s: '[', n: 0 },
          { s: 'X', n: m.n - 2 },
          { s: ']', n: 0 },
        );
      }
    }
    str = out;
    if (!changed) return str;
  }
}

export interface Topology {
  n: number;
  parent: Int32Array;
  childA: Int32Array; // continuation (n−1), −1 if none
  childB: Int32Array; // side shoot (n−2), −1 if none
  budget: Int8Array; // the n of F(n)
  gen: Uint8Array; // rewriting step that created it: ROOT − n
  depth: Uint8Array; // segments from the root
  order: Uint8Array; // how many side shoots taken from the root
  axisIndex: Uint8Array; // continuation steps since the axis began
  axisRoot: Int32Array; // first segment of this node's axis
  size: Int32Array; // segments in subtree, including self
  rand: Float32Array; // 4 stable random numbers per node
}

function hash(x: number): number {
  x |= 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export function buildTopology(root = ROOT): Topology {
  const mods = rewrite(root);
  let n = 0;
  for (const m of mods) if (m.s === 'F') n++;
  const T: Topology = {
    n,
    parent: new Int32Array(n).fill(-1),
    childA: new Int32Array(n).fill(-1),
    childB: new Int32Array(n).fill(-1),
    budget: new Int8Array(n),
    gen: new Uint8Array(n),
    depth: new Uint8Array(n),
    order: new Uint8Array(n),
    axisIndex: new Uint8Array(n),
    axisRoot: new Int32Array(n),
    size: new Int32Array(n).fill(1),
    rand: new Float32Array(n * 4),
  };
  const stack: number[] = [];
  let cur = -1;
  let k = 0;
  for (const m of mods) {
    if (m.s === '[') stack.push(cur);
    else if (m.s === ']') cur = stack.pop()!;
    else if (m.s === 'F') {
      const i = k++;
      T.budget[i] = m.n;
      T.gen[i] = root - m.n;
      T.parent[i] = cur;
      if (cur < 0) {
        T.axisRoot[i] = i;
      } else {
        T.depth[i] = T.depth[cur] + 1;
        const isA = m.n === T.budget[cur] - 1;
        if (isA) {
          T.childA[cur] = i;
          T.order[i] = T.order[cur];
          T.axisIndex[i] = T.axisIndex[cur] + 1;
          T.axisRoot[i] = T.axisRoot[cur];
        } else {
          T.childB[cur] = i;
          T.order[i] = T.order[cur] + 1;
          T.axisRoot[i] = i;
        }
      }
      for (let r = 0; r < 4; r++) T.rand[i * 4 + r] = hash(i * 4 + r + 9173);
      cur = i;
    }
  }
  // preorder ⇒ children come after parents; accumulate sizes backwards
  for (let i = n - 1; i > 0; i--) T.size[T.parent[i]] += T.size[i];
  return T;
}

export const rnd = (T: Topology, i: number, r: number) => T.rand[i * 4 + r];
