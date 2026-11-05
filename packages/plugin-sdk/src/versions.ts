const parse = (version: string) => {
  const [core = '', prerelease] = version.split(/-(.*)/s)
  return { numbers: core.split('.').map(Number), prerelease: prerelease ?? null }
}

export function compareVersions(a: string, b: string): number {
  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < 3; index++) {
    const difference = (left.numbers[index] ?? 0) - (right.numbers[index] ?? 0)
    if (difference) return Math.sign(difference)
  }
  if (left.prerelease === right.prerelease) return 0
  if (left.prerelease === null) return 1
  if (right.prerelease === null) return -1
  return left.prerelease < right.prerelease ? -1 : 1
}
