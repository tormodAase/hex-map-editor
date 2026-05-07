export type MapData = {
  terrainTiles: Record<string, string>
  locationTiles: Record<string, string>
  riverEdges: string[]
  version: number
}

export function serializeMap(
  terrainTiles: Map<string, string>,
  locationTiles: Map<string, string>,
  riverEdges: Set<string>
): MapData {
  return {
    terrainTiles: Object.fromEntries(terrainTiles),
    locationTiles: Object.fromEntries(locationTiles),
    riverEdges: Array.from(riverEdges),
    version: 1,
  }
}

export function deserializeMap(data: MapData): {
  terrainTiles: Map<string, string>
  locationTiles: Map<string, string>
  riverEdges: Set<string>
} {
  return {
    terrainTiles: new Map(Object.entries(data.terrainTiles)),
    locationTiles: new Map(Object.entries(data.locationTiles)),
    riverEdges: new Set(data.riverEdges),
  }
}

const STORAGE_KEY = 'hex-map-editor-map'

export function loadMapFromStorage(): MapData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const data = JSON.parse(stored) as MapData
    return data
  } catch (e) {
    console.error('Failed to load map from storage:', e)
    return null
  }
}

export function saveMapToStorage(mapData: MapData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mapData))
  } catch (e) {
    console.error('Failed to save map to storage:', e)
  }
}

export function exportMapToFile(mapData: MapData, filename: string = 'map.json'): void {
  const json = JSON.stringify(mapData, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function importMapFromFile(file: File): Promise<MapData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const data = JSON.parse(content) as MapData
        resolve(data)
      } catch (error) {
        reject(new Error('Failed to parse map file'))
      }
    }
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    reader.readAsText(file)
  })
}
