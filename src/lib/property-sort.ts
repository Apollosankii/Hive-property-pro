/** Natural-ish unit number order (numeric when possible). */
export function compareUnitNumbers(a: string, b: string): number {
  const sa = (a ?? '').toString().trim()
  const sb = (b ?? '').toString().trim()
  const na = parseFloat(sa)
  const nb = parseFloat(sb)
  if (!Number.isNaN(na) && !Number.isNaN(nb) && sa !== '' && sb !== '') {
    return na - nb
  }
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' })
}

export function getBuildingName(item: {
  building_name?: string
  buildings?: { name?: string } | null
  units?: { buildings?: { name?: string } | null } | null
}): string {
  return (
    item.building_name ||
    item.buildings?.name ||
    item.units?.buildings?.name ||
    'Unassigned property'
  )
}

export function getBuildingId(item: {
  building_id?: string | null
  units?: { building_id?: string | null } | null
}): string {
  return item.building_id || item.units?.building_id || ''
}

export function compareByBuildingThenUnit(a: any, b: any): number {
  const buildingCmp = getBuildingName(a).localeCompare(getBuildingName(b), undefined, {
    sensitivity: 'base',
  })
  if (buildingCmp !== 0) return buildingCmp

  const ua = (a.unit_number ?? a.units?.unit_number ?? '').toString()
  const ub = (b.unit_number ?? b.units?.unit_number ?? '').toString()
  return compareUnitNumbers(ua, ub)
}

export function sortByBuildingThenUnit<T>(items: T[]): T[] {
  return [...items].sort(compareByBuildingThenUnit)
}

export function groupByBuilding<T extends Record<string, any>>(items: T[]): Array<{
  buildingId: string
  buildingName: string
  items: T[]
}> {
  const groups: Array<{ buildingId: string; buildingName: string; items: T[] }> = []
  let current: (typeof groups)[number] | null = null

  for (const item of sortByBuildingThenUnit(items)) {
    const buildingId = getBuildingId(item) || getBuildingName(item)
    const buildingName = getBuildingName(item)

    if (!current || current.buildingId !== buildingId) {
      current = { buildingId, buildingName, items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }

  return groups
}

export function filterByBuildingId<T extends { building_id?: string | null; units?: { building_id?: string | null } | null }>(
  items: T[],
  buildingId: string
): T[] {
  if (!buildingId) return items
  return items.filter((item) => getBuildingId(item) === buildingId)
}
