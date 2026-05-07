import { useEffect, useRef } from 'react'
import { Application, Container, Graphics } from 'pixi.js'

type TerrainDefinition = {
  id: string
  label: string
  fillColor: number
  edgeColor: number
  cssColor: string
}

type HexViewportProps = {
  onZoomChange?: (zoom: number) => void
  selectedTerrainId: string
  terrainDefinitions: TerrainDefinition[]
  activeTool: 'move' | 'paint' | 'erase'
}

const SQRT3 = Math.sqrt(3)
const HEX_SIZE = 36
const MIN_ZOOM = 0.05
const MAX_ZOOM = 3
const ZOOM_SENSITIVITY = 0.005

type Axial = {
  q: number
  r: number
}

type Cube = {
  x: number
  y: number
  z: number
}

type ViewBounds = {
  minQ: number
  maxQ: number
  minR: number
  maxR: number
}

function drawHexTile(g: Graphics, x: number, y: number, radius: number): void {
  // Pointy-top orientation that matches axial conversion math.
  const startAngle = -Math.PI / 6
  g.moveTo(x + radius * Math.cos(startAngle), y + radius * Math.sin(startAngle))

  for (let i = 1; i <= 6; i += 1) {
    const angle = startAngle + (Math.PI / 3) * i
    g.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle))
  }
}

function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (SQRT3 * q + (SQRT3 / 2) * r)
  const y = size * ((3 / 2) * r)
  return { x, y }
}

function pixelToAxial(x: number, y: number, size: number): Axial {
  const q = ((SQRT3 / 3) * x - (1 / 3) * y) / size
  const r = ((2 / 3) * y) / size
  return { q, r }
}

function axialToCube(axial: Axial): Cube {
  return {
    x: axial.q,
    z: axial.r,
    y: -axial.q - axial.r,
  }
}

function cubeToAxial(cube: Cube): Axial {
  return {
    q: cube.x,
    r: cube.z,
  }
}

function roundAxial(axial: Axial): Axial {
  const cube = axialToCube(axial)

  let rx = Math.round(cube.x)
  let ry = Math.round(cube.y)
  let rz = Math.round(cube.z)

  const xDiff = Math.abs(rx - cube.x)
  const yDiff = Math.abs(ry - cube.y)
  const zDiff = Math.abs(rz - cube.z)

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz
  } else if (yDiff > zDiff) {
    ry = -rx - rz
  } else {
    rz = -rx - ry
  }

  return cubeToAxial({ x: rx, y: ry, z: rz })
}

function getVisibleHexBounds(
  viewWidth: number,
  viewHeight: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): ViewBounds {
  const corners = [
    { x: 0, y: 0 },
    { x: viewWidth, y: 0 },
    { x: 0, y: viewHeight },
    { x: viewWidth, y: viewHeight },
  ]

  let minQ = Number.POSITIVE_INFINITY
  let maxQ = Number.NEGATIVE_INFINITY
  let minR = Number.POSITIVE_INFINITY
  let maxR = Number.NEGATIVE_INFINITY

  for (const corner of corners) {
    const worldX = (corner.x - cameraX) / zoom
    const worldY = (corner.y - cameraY) / zoom
    const axial = pixelToAxial(worldX, worldY, HEX_SIZE)

    minQ = Math.min(minQ, axial.q)
    maxQ = Math.max(maxQ, axial.q)
    minR = Math.min(minR, axial.r)
    maxR = Math.max(maxR, axial.r)
  }

  const padding = 3

  return {
    minQ: Math.floor(minQ) - padding,
    maxQ: Math.ceil(maxQ) + padding,
    minR: Math.floor(minR) - padding,
    maxR: Math.ceil(maxR) + padding,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function makeCellKey(q: number, r: number): string {
  return `${q},${r}`
}

export function HexViewport({
  onZoomChange,
  selectedTerrainId,
  terrainDefinitions,
  activeTool,
}: HexViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const selectedTerrainRef = useRef(selectedTerrainId)
  const activeToolRef = useRef(activeTool)

  useEffect(() => {
    selectedTerrainRef.current = selectedTerrainId
  }, [selectedTerrainId])

  useEffect(() => {
    activeToolRef.current = activeTool
  }, [activeTool])

  useEffect(() => {
    let destroyed = false

    const init = async () => {
      if (!hostRef.current) {
        return
      }

      const app = new Application()
      await app.init({
        resizeTo: hostRef.current,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        background: '#10171f',
      })

      if (destroyed || !hostRef.current) {
        app.destroy(true)
        return
      }

      hostRef.current.appendChild(app.canvas)

      const world = new Container()
      app.stage.addChild(world)

      const terrainLayer = new Graphics()
      const grid = new Graphics()
      const hover = new Graphics()
      grid.setStrokeStyle({ width: 1.5, color: 0x2f445f, alpha: 0.95 })
      const terrainById = new Map(terrainDefinitions.map((terrain) => [terrain.id, terrain]))
      const terrainTiles = new Map<string, string>()

      world.addChild(terrainLayer)
      world.addChild(grid)
      world.addChild(hover)

      world.position.set(app.renderer.width / 2, app.renderer.height / 2)

      let isPanning = false
      let isPaintingStroke = false
      let lastX = 0
      let lastY = 0
      let currentZoom = 1
      let needsRedraw = true

      const redrawVisibleGrid = () => {
        terrainLayer.clear()
        grid.clear()
        grid.setStrokeStyle({ width: 1.5, color: 0x2f445f, alpha: 0.95 })

        const bounds = getVisibleHexBounds(
          app.renderer.width,
          app.renderer.height,
          world.position.x,
          world.position.y,
          currentZoom,
        )

        for (let r = bounds.minR; r <= bounds.maxR; r += 1) {
          for (let q = bounds.minQ; q <= bounds.maxQ; q += 1) {
            const center = hexToPixel(q, r, HEX_SIZE)

            const terrainId = terrainTiles.get(makeCellKey(q, r))
            if (terrainId) {
              const terrain = terrainById.get(terrainId)
              if (terrain) {
                terrainLayer.setFillStyle({ color: terrain.fillColor, alpha: 1 })
                terrainLayer.setStrokeStyle({
                  width: 1,
                  color: terrain.edgeColor,
                  alpha: 0.95,
                })
                drawHexTile(terrainLayer, center.x, center.y, HEX_SIZE)
                terrainLayer.fill()
                terrainLayer.stroke()
              }
            }

            drawHexTile(grid, center.x, center.y, HEX_SIZE)
          }
        }

        grid.stroke()
      }

      const maybeRedrawGrid = () => {
        if (!needsRedraw) {
          return
        }

        redrawVisibleGrid()
        needsRedraw = false
      }

      const screenToCanvas = (
        screenX: number,
        screenY: number,
      ): { x: number; y: number } | null => {
        const rect = app.canvas.getBoundingClientRect()
        const x = screenX - rect.left
        const y = screenY - rect.top

        if (x < 0 || y < 0 || x > app.renderer.width || y > app.renderer.height) {
          return null
        }

        return { x, y }
      }

      const highlightHoveredHex = (screenX: number, screenY: number) => {
        const local = screenToCanvas(screenX, screenY)

        if (!local) {
          hover.clear()
          return
        }

        const worldX = (local.x - world.position.x) / currentZoom
        const worldY = (local.y - world.position.y) / currentZoom
        const fractional = pixelToAxial(worldX, worldY, HEX_SIZE)
        const cell = roundAxial(fractional)
        const center = hexToPixel(cell.q, cell.r, HEX_SIZE)

        hover.clear()
        hover.setStrokeStyle({ width: 2.5, color: 0x77d5ff, alpha: 0.95 })
        drawHexTile(hover, center.x, center.y, HEX_SIZE)
        hover.stroke()
      }

      const paintCellAtScreen = (screenX: number, screenY: number) => {
        const local = screenToCanvas(screenX, screenY)
        if (!local) {
          return
        }

        const worldX = (local.x - world.position.x) / currentZoom
        const worldY = (local.y - world.position.y) / currentZoom
        const fractional = pixelToAxial(worldX, worldY, HEX_SIZE)
        const cell = roundAxial(fractional)
        const key = makeCellKey(cell.q, cell.r)

        if (activeToolRef.current === 'erase') {
          terrainTiles.delete(key)
        } else {
          terrainTiles.set(key, selectedTerrainRef.current)
        }

        needsRedraw = true
      }

      redrawVisibleGrid()
      onZoomChange?.(currentZoom)

      const updateZoomAtPoint = (localX: number, localY: number, nextZoom: number) => {
        const beforeX = (localX - world.position.x) / currentZoom
        const beforeY = (localY - world.position.y) / currentZoom

        world.scale.set(nextZoom)
        world.position.set(localX - beforeX * nextZoom, localY - beforeY * nextZoom)

        currentZoom = nextZoom
        needsRedraw = true
        onZoomChange?.(currentZoom)
      }

      const onPointerDown = (event: PointerEvent) => {
        if (event.button === 0) {
          if (activeToolRef.current === 'move') {
            isPanning = true
            lastX = event.clientX
            lastY = event.clientY
          } else {
            isPaintingStroke = true
            paintCellAtScreen(event.clientX, event.clientY)
            highlightHoveredHex(event.clientX, event.clientY)
          }
          return
        }

        if (event.button === 1 || event.button === 2) {
          isPanning = true
          lastX = event.clientX
          lastY = event.clientY
        }
      }

      const onPointerMove = (event: PointerEvent) => {
        highlightHoveredHex(event.clientX, event.clientY)

        if (isPaintingStroke && activeToolRef.current !== 'move') {
          paintCellAtScreen(event.clientX, event.clientY)
        }

        if (isPanning) {
          world.position.x += event.clientX - lastX
          world.position.y += event.clientY - lastY
          needsRedraw = true

          lastX = event.clientX
          lastY = event.clientY
        }
      }

      const onPointerUp = (event: PointerEvent) => {
        if (event.button === 0) {
          isPaintingStroke = false
          isPanning = false
        }

        if (event.button === 1 || event.button === 2) {
          isPanning = false
        }
      }

      const onPointerCancel = () => {
        isPaintingStroke = false
        isPanning = false
      }

      const onContextMenu = (event: MouseEvent) => {
        event.preventDefault()
      }

      const onWheel = (event: WheelEvent) => {
        event.preventDefault()

        const local = screenToCanvas(event.clientX, event.clientY)
        if (!local) {
          return
        }

        let sensitivity = ZOOM_SENSITIVITY
        if (event.deltaMode === 1) {
          sensitivity = 0.09
        } else if (event.deltaMode === 2) {
          sensitivity = 0.6
        }

        if (event.ctrlKey) {
          sensitivity *= 2
        }

        const zoomDelta = Math.exp(-event.deltaY * sensitivity)
        const nextZoom = clamp(currentZoom * zoomDelta, MIN_ZOOM, MAX_ZOOM)

        if (nextZoom === currentZoom) {
          return
        }

        updateZoomAtPoint(local.x, local.y, nextZoom)
      }

      app.canvas.addEventListener('pointerdown', onPointerDown)
      app.canvas.addEventListener('contextmenu', onContextMenu)
      app.canvas.addEventListener('wheel', onWheel, { passive: false })
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('pointercancel', onPointerCancel)
      app.stage.eventMode = 'static'
      app.ticker.add(maybeRedrawGrid)

      const onResize = () => {
        if (!hostRef.current) {
          return
        }

        const rect = hostRef.current.getBoundingClientRect()
        app.renderer.resize(rect.width, rect.height)
        needsRedraw = true
      }

      window.addEventListener('resize', onResize)

      return () => {
        app.canvas.removeEventListener('pointerdown', onPointerDown)
        app.canvas.removeEventListener('contextmenu', onContextMenu)
        app.canvas.removeEventListener('wheel', onWheel)
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerCancel)
        window.removeEventListener('resize', onResize)
        app.ticker.remove(maybeRedrawGrid)
        app.destroy(true)
      }
    }

    let teardown: (() => void) | undefined

    void init().then((cleanup) => {
      teardown = cleanup
    })

    return () => {
      destroyed = true
      if (teardown) {
        teardown()
      }
    }
  }, [onZoomChange, terrainDefinitions])

  return <div className="viewport" ref={hostRef} />
}
