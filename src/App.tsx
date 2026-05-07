import { useState } from 'react'
import { HexViewport } from './components/HexViewport'
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

type ToolMode = 'move' | 'paint' | 'erase' | 'location' | 'erase-location'

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
  const [zoom, setZoom] = useState(1)
  const [selectedTerrainId, setSelectedTerrainId] = useState(TERRAIN_TYPES[0].id)
  const [selectedLocationId, setSelectedLocationId] = useState(LOCATION_TYPES[0].id)
  const [activeTool, setActiveTool] = useState<ToolMode>('paint')

  return (
    <main className="app-shell">
      <HexViewport
        onZoomChange={setZoom}
        selectedTerrainId={selectedTerrainId}
        terrainDefinitions={TERRAIN_TYPES}
        locationDefinitions={LOCATION_TYPES}
        selectedLocationId={selectedLocationId}
        activeTool={activeTool}
      />

      <section className="terrain-palette" aria-label="Terrain palette">
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

      <div className="zoom-indicator" role="status" aria-live="polite">
        Zoom {Math.round(zoom * 100)}%
      </div>
    </main>
  )
}

export default App
