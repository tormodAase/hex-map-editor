import { useState } from 'react'
import { HexViewport } from './components/HexViewport'
import './App.css'

function App() {
  const [zoom, setZoom] = useState(1)

  return (
    <main className="app-shell">
      <HexViewport onZoomChange={setZoom} />
      <div className="zoom-indicator" role="status" aria-live="polite">
        Zoom {Math.round(zoom * 100)}%
      </div>
    </main>
  )
}

export default App
