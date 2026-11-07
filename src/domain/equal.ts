/** Exact JSON-state comparison without serialized copies. Shared immutable
 * subtrees are compared once per call, including blocks shared across history. */
export function equalValue(a: unknown, b: unknown): boolean {
  const pairs = new WeakMap<object, WeakSet<object>>();
  const compare = (left: unknown, right: unknown): boolean => {
    if (left === right) return true;
    if (
      left === null ||
      right === null ||
      typeof left !== "object" ||
      typeof right !== "object"
    )
      return false;
    if (pairs.get(left)?.has(right)) return true;
    if (Array.isArray(left)) {
      if (!Array.isArray(right) || left.length !== right.length) return false;
      for (let i = 0; i < left.length; i++)
        if (!compare(left[i], right[i])) return false;
    } else {
      if (Array.isArray(right)) return false;
      const x = left as Record<string, unknown>,
        y = right as Record<string, unknown>;
      const keys = Object.keys(x).filter((key) => x[key] !== undefined);
      if (
        keys.length !==
        Object.keys(y).filter((key) => y[key] !== undefined).length
      )
        return false;
      for (const key of keys)
        if (!Object.hasOwn(y, key) || !compare(x[key], y[key])) return false;
    }
    let seen = pairs.get(left);
    if (!seen) {
      seen = new WeakSet();
      pairs.set(left, seen);
    }
    seen.add(right);
    return true;
  };
  return compare(a, b);
}
