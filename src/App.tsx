import { useState } from 'react'
import { HexViewport } from './components/HexViewport'
import './App.css'

type TerrainDefinition = {
  id: string
  label: string
  fillColor: number
  edgeColor: number
  cssColor: string
}

type ToolMode = 'move' | 'paint' | 'erase'

const TERRAIN_TYPES: TerrainDefinition[] = [
  {
    id: 'grass',
    label: 'Grass',
    fillColor: 0x4c8f42,
    edgeColor: 0x2f6a2f,
    cssColor: '#4c8f42',
  },
  {
    id: 'water',
    label: 'Water',
    fillColor: 0x2c6eb3,
    edgeColor: 0x194a85,
    cssColor: '#2c6eb3',
  },
  {
    id: 'forest',
    label: 'Forest',
    fillColor: 0x2d5b33,
    edgeColor: 0x1c3f22,
    cssColor: '#2d5b33',
  },
  {
    id: 'hill',
    label: 'Hill',
    fillColor: 0xb48552,
    edgeColor: 0x7d5a36,
    cssColor: '#b48552',
  },
  {
    id: 'mountain',
    label: 'Mountain',
    fillColor: 0x8f9499,
    edgeColor: 0x5e6368,
    cssColor: '#8f9499',
  },
  {
    id: 'desert',
    label: 'Desert',
    fillColor: 0xd8be74,
    edgeColor: 0x9e8548,
    cssColor: '#d8be74',
  },
]

function App() {
  const [zoom, setZoom] = useState(1)
  const [selectedTerrainId, setSelectedTerrainId] = useState(TERRAIN_TYPES[0].id)
  const [activeTool, setActiveTool] = useState<ToolMode>('paint')

  return (
    <main className="app-shell">
      <HexViewport
        onZoomChange={setZoom}
        selectedTerrainId={selectedTerrainId}
        terrainDefinitions={TERRAIN_TYPES}
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
                style={{
                  backgroundColor: terrain.cssColor,
                }}
              />
              <span>{terrain.label}</span>
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
