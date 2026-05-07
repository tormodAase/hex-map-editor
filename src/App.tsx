import { useState, useEffect, useRef } from 'react'
import { HexViewport, type HexViewportHandle } from './components/HexViewport'
import { loadMapFromStorage, saveMapToStorage, exportMapToFile, importMapFromFile, serializeMap, type MapData } from './utils/mapStorage'
import './App.css'

type TerrainDefinition = {
  id: string
  label: string
  fillColor: number
  edgeColor: number
  cssColor: string
  iconPath: string
}

export type LocationDefinition = {
  id: string
  label: string
  iconPath: string
}

type ToolMode = 'move' | 'paint' | 'erase' | 'location' | 'erase-location' | 'river' | 'erase-river'

const TERRAIN_TYPES: TerrainDefinition[] = [
  {
    id: 'grass',
    label: 'Grass',
    fillColor: 0x4c8f42,
    edgeColor: 0x2f6a2f,
    cssColor: '#4c8f42',
    iconPath: '/terrain-icons/grass.svg',
  },
  {
    id: 'water',
    label: 'Water',
    fillColor: 0x2c6eb3,
    edgeColor: 0x194a85,
    cssColor: '#2c6eb3',
    iconPath: '/terrain-icons/water.svg',
  },
  {
    id: 'forest',
    label: 'Forest',
    fillColor: 0x2d5b33,
    edgeColor: 0x1c3f22,
    cssColor: '#2d5b33',
    iconPath: '/terrain-icons/forest.svg',
  },
  {
    id: 'hill',
    label: 'Hill',
    fillColor: 0xb48552,
    edgeColor: 0x7d5a36,
    cssColor: '#b48552',
    iconPath: '/terrain-icons/hill.svg',
  },
  {
    id: 'mountain',
    label: 'Mountain',
    fillColor: 0x8f9499,
    edgeColor: 0x5e6368,
    cssColor: '#8f9499',
    iconPath: '/terrain-icons/mountain.svg',
  },
  {
    id: 'desert',
    label: 'Desert',
    fillColor: 0xd8be74,
    edgeColor: 0x9e8548,
    cssColor: '#d8be74',
    iconPath: '/terrain-icons/desert.svg',
  },
]

const LOCATION_TYPES: LocationDefinition[] = [
  { id: 'castle',     label: 'Castle',     iconPath: '/location-icons/castle.svg' },
  { id: 'city',       label: 'City',       iconPath: '/location-icons/city.svg' },
  { id: 'town',       label: 'Town',       iconPath: '/location-icons/town.svg' },
  { id: 'village',    label: 'Village',    iconPath: '/location-icons/village.svg' },
  { id: 'hamlet',     label: 'Hamlet',     iconPath: '/location-icons/hamlet.svg' },
  { id: 'ruins',      label: 'Ruins',      iconPath: '/location-icons/ruins.svg' },
  { id: 'mine',       label: 'Mine',       iconPath: '/location-icons/mine.svg' },
  { id: 'port',       label: 'Port',       iconPath: '/location-icons/port.svg' },
  { id: 'temple',     label: 'Temple',     iconPath: '/location-icons/temple.svg' },
  { id: 'camp',       label: 'Camp',       iconPath: '/location-icons/camp.svg' },
  { id: 'lighthouse', label: 'Lighthouse', iconPath: '/location-icons/lighthouse.svg' },
  { id: 'dungeon',    label: 'Dungeon',    iconPath: '/location-icons/dungeon.svg' },
  { id: 'tower',      label: 'Tower',      iconPath: '/location-icons/tower.svg' },
  { id: 'monument',   label: 'Monument',   iconPath: '/location-icons/monument.svg' },
]

function App() {
  const viewportRef = useRef<HexViewportHandle | null>(null)
  const [zoom, setZoom] = useState(1)
  const [selectedTerrainId, setSelectedTerrainId] = useState(TERRAIN_TYPES[0].id)
  const [selectedLocationId, setSelectedLocationId] = useState(LOCATION_TYPES[0].id)
  const [activeTool, setActiveTool] = useState<ToolMode>('paint')
  
  // Initialize from localStorage
  const initializeMapData = () => {
    const stored = loadMapFromStorage()
    if (stored) {
      return {
        terrainTiles: new Map(Object.entries(stored.terrainTiles)),
        locationTiles: new Map(Object.entries(stored.locationTiles)),
        riverEdges: new Set(stored.riverEdges),
      }
    }
    return {
      terrainTiles: new Map<string, string>(),
      locationTiles: new Map<string, string>(),
      riverEdges: new Set<string>(),
    }
  }
  
  const [terrainTiles, setTerrainTiles] = useState<Map<string, string>>(() => initializeMapData().terrainTiles)
  const [locationTiles, setLocationTiles] = useState<Map<string, string>>(() => initializeMapData().locationTiles)
  const [riverEdges, setRiverEdges] = useState<Set<string>>(() => initializeMapData().riverEdges)
  const [undoStack, setUndoStack] = useState<MapData[]>([])
  const [redoStack, setRedoStack] = useState<MapData[]>([])

  // Save map to storage whenever it changes
  useEffect(() => {
    const mapData = serializeMap(terrainTiles, locationTiles, riverEdges)
    saveMapToStorage(mapData)
  }, [terrainTiles, locationTiles, riverEdges])

  const handleExport = () => {
    const mapData = serializeMap(terrainTiles, locationTiles, riverEdges)
    const timestamp = new Date().toISOString().split('T')[0]
    exportMapToFile(mapData, `hex-map-${timestamp}.json`)
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const currentMap = serializeMap(terrainTiles, locationTiles, riverEdges)
      const mapData = await importMapFromFile(file)
      setTerrainTiles(new Map(Object.entries(mapData.terrainTiles)))
      setLocationTiles(new Map(Object.entries(mapData.locationTiles)))
      setRiverEdges(new Set(mapData.riverEdges))
      setUndoStack((prev) => [...prev, currentMap])
      setRedoStack([])
      event.target.value = ''
    } catch (error) {
      console.error('Failed to import map:', error)
      alert('Failed to import map. Please check the file format.')
    }
  }

  const handleMapChange = (
    nextTerrainTiles: Map<string, string>,
    nextLocationTiles: Map<string, string>,
    nextRiverEdges: Set<string>,
  ) => {
    setTerrainTiles(nextTerrainTiles)
    setLocationTiles(nextLocationTiles)
    setRiverEdges(nextRiverEdges)
  }

  const handleMapActionCommit = (
    previousTerrainTiles: Map<string, string>,
    previousLocationTiles: Map<string, string>,
    previousRiverEdges: Set<string>,
  ) => {
    const previousMap = serializeMap(previousTerrainTiles, previousLocationTiles, previousRiverEdges)
    setUndoStack((prev) => [...prev, previousMap])
    setRedoStack([])
  }

  const handleUndo = () => {
    if (undoStack.length === 0) return

    const currentMap = serializeMap(terrainTiles, locationTiles, riverEdges)
    const previousMap = undoStack[undoStack.length - 1]

    setUndoStack((prev) => prev.slice(0, -1))
    setRedoStack((prev) => [currentMap, ...prev])
    setTerrainTiles(new Map(Object.entries(previousMap.terrainTiles)))
    setLocationTiles(new Map(Object.entries(previousMap.locationTiles)))
    setRiverEdges(new Set(previousMap.riverEdges))
  }

  const handleRedo = () => {
    if (redoStack.length === 0) return

    const currentMap = serializeMap(terrainTiles, locationTiles, riverEdges)
    const nextMap = redoStack[0]

    setRedoStack((prev) => prev.slice(1))
    setUndoStack((prev) => [...prev, currentMap])
    setTerrainTiles(new Map(Object.entries(nextMap.terrainTiles)))
    setLocationTiles(new Map(Object.entries(nextMap.locationTiles)))
    setRiverEdges(new Set(nextMap.riverEdges))
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable

      if (isEditable) {
        return
      }

      const cmdOrCtrl = event.ctrlKey || event.metaKey
      if (!cmdOrCtrl) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'z' && event.shiftKey) {
        event.preventDefault()
        handleRedo()
        return
      }

      if (key === 'z') {
        event.preventDefault()
        handleUndo()
        return
      }

      if (key === 'y') {
        event.preventDefault()
        handleRedo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [handleUndo, handleRedo])

  const handlePrintPng = () => {
    viewportRef.current?.downloadPng()
  }

  return (
    <main className="app-shell">
      <HexViewport
        ref={viewportRef}
        onZoomChange={setZoom}
        selectedTerrainId={selectedTerrainId}
        terrainDefinitions={TERRAIN_TYPES}
        locationDefinitions={LOCATION_TYPES}
        selectedLocationId={selectedLocationId}
        activeTool={activeTool}
        terrainTiles={terrainTiles}
        locationTiles={locationTiles}
        riverEdges={riverEdges}
        onMapChange={handleMapChange}
        onMapActionCommit={handleMapActionCommit}
      />

      <section className="terrain-palette" aria-label="Terrain palette">
        <div className="palette-heading">Base Tiles</div>
        <button
          className={`terrain-button move${activeTool === 'move' ? ' active' : ''}`}
          type="button"
          onClick={() => setActiveTool('move')}
          aria-pressed={activeTool === 'move'}
        >
          <span className="terrain-swatch move-swatch" />
          <span>Move</span>
        </button>

        <button
          className={`terrain-button erase${activeTool === 'erase' ? ' active' : ''}`}
          type="button"
          onClick={() => setActiveTool('erase')}
          aria-pressed={activeTool === 'erase'}
        >
          <span className="terrain-swatch erase-swatch" />
          <span>Eraser</span>
        </button>

        {TERRAIN_TYPES.map((terrain) => {
          const isSelected = activeTool === 'paint' && terrain.id === selectedTerrainId

          return (
            <button
              key={terrain.id}
              className={`terrain-button${isSelected ? ' active' : ''}`}
              type="button"
              onClick={() => {
                setSelectedTerrainId(terrain.id)
                setActiveTool('paint')
              }}
              aria-pressed={isSelected}
            >
              <span
                className="terrain-swatch"
                style={{ backgroundColor: terrain.cssColor }}
              />
              <span>{terrain.label}</span>
            </button>
          )
        })}

        <div className="palette-divider" />
        <div className="palette-heading river-heading">Rivers</div>

        <button
          className={`terrain-button river${activeTool === 'river' ? ' active' : ''}`}
          type="button"
          onClick={() => setActiveTool('river')}
          aria-pressed={activeTool === 'river'}
        >
          <span className="terrain-swatch river-swatch" />
          <span>Draw</span>
        </button>

        <button
          className={`terrain-button river-erase${activeTool === 'erase-river' ? ' active' : ''}`}
          type="button"
          onClick={() => setActiveTool('erase-river')}
          aria-pressed={activeTool === 'erase-river'}
        >
          <span className="terrain-swatch erase-swatch" />
          <span>Erase</span>
        </button>
      </section>

      <section className="location-palette" aria-label="Location palette">
        <div className="palette-heading">Locations</div>
        <button
          className={`terrain-button erase${activeTool === 'erase-location' ? ' active' : ''}`}
          type="button"
          onClick={() => setActiveTool('erase-location')}
          aria-pressed={activeTool === 'erase-location'}
        >
          <span className="terrain-swatch erase-swatch" />
          <span>Remove</span>
        </button>
        {LOCATION_TYPES.map((loc) => {
          const isSelected = activeTool === 'location' && loc.id === selectedLocationId
          return (
            <button
              key={loc.id}
              className={`terrain-button${isSelected ? ' active' : ''}`}
              type="button"
              onClick={() => {
                setSelectedLocationId(loc.id)
                setActiveTool('location')
              }}
              aria-pressed={isSelected}
            >
              <img
                className="location-swatch"
                src={loc.iconPath}
                alt={loc.label}
                width={24}
                height={24}
              />
              <span>{loc.label}</span>
            </button>
          )
        })}
      </section>

      <section className="file-controls" aria-label="File controls">
        <button
          className="undo-button"
          type="button"
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          title="Undo last change"
        >
          Undo
        </button>
        <button
          className="redo-button"
          type="button"
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          title="Redo last undone change"
        >
          Redo
        </button>
        <button
          className="print-button"
          type="button"
          onClick={handlePrintPng}
          title="Download current viewport as PNG"
        >
          Print PNG
        </button>
        <button
          className="export-button"
          type="button"
          onClick={handleExport}
          title="Download map as JSON"
        >
          ↑ Export
        </button>
        <label className="import-button" title="Load map from JSON file">
          ↓ Import
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </label>
      </section>

      <div className="zoom-indicator" role="status" aria-live="polite">
        Zoom {Math.round(zoom * 100)}%
      </div>
    </main>
  )
}

export default App
