function canonicalizeSkillUpdateNames(names: readonly string[]): string[] | null {
  const canonicalNames = [...new Set(names)].sort((left, right) => left.localeCompare(right, 'en'))
  // Why: names become editable shell input. Official manifests use this
  // restricted package-name grammar so no entry can introduce shell syntax.
  if (canonicalNames.some((name) => !/^[a-z0-9][a-z0-9._-]*$/.test(name))) {
    return null
  }
  return canonicalNames.length > 0 ? canonicalNames : null
}

export function buildTargetedSkillUpdateCommand(names: readonly string[]): string | null {
  const canonicalNames = canonicalizeSkillUpdateNames(names)
  return canonicalNames ? `npx skills update ${canonicalNames.join(' ')} --global` : null
}
