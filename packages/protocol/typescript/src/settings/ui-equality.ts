export function persistedUIValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }

  if (left instanceof Set || right instanceof Set) {
    if (!(left instanceof Set) || !(right instanceof Set) || left.size !== right.size) {
      return false
    }
    for (const value of left) {
      if (!right.has(value)) {
        return false
      }
    }
    return true
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false
    }
    return left.every((value, index) => persistedUIValuesEqual(value, right[index]))
  }

  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false
  }

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  for (const key of leftKeys) {
    if (
      !Object.prototype.hasOwnProperty.call(right, key) ||
      !persistedUIValuesEqual(Reflect.get(left, key), Reflect.get(right, key))
    ) {
      return false
    }
  }
  return true
}
