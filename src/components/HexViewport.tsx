import { useEffect, useRef } from 'react'
import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js'
import type { LocationDefinition } from '../App'

type TerrainDefinition = {
  id: string
  label: string
  fillColor: number
  edgeColor: number
  cssColor: string
  iconPath: string
}

type HexViewportProps = {
  onZoomChange?: (zoom: number) => void
  selectedTerrainId: string
  terrainDefinitions: TerrainDefinition[]
  locationDefinitions: LocationDefinition[]
  selectedLocationId: string
  activeTool: 'move' | 'paint' | 'erase' | 'location' | 'erase-location' | 'river' | 'erase-river'
  terrainTiles: Map<string, string>
  setTerrainTiles: (tiles: Map<string, string>) => void
  locationTiles: Map<string, string>
  setLocationTiles: (tiles: Map<string, string>) => void
  riverEdges: Set<string>
  setRiverEdges: (edges: Set<string>) => void
}

const SQRT3 = Math.sqrt(3)
const HEX_SIZE = 36
const MIN_ZOOM = 0.05
const MAX_ZOOM = 3
const ZOOM_SENSITIVITY = 0.005

// Pointy-top neighbor directions in axial coords, in vertex order.
// Direction i shares the edge between vertex[i] and vertex[(i+1)%6].
const NEIGHBOR_DIRS: Axial[] = [
  { q: 1, r: 0 },   // E  – edge v0→v1
  { q: 0, r: 1 },   // SE – edge v1→v2
  { q: -1, r: 1 },  // SW – edge v2→v3
  { q: -1, r: 0 },  // W  – edge v3→v4
  { q: 0, r: -1 },  // NW – edge v4→v5
  { q: 1, r: -1 },  // NE – edge v5→v0
]

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

// Canonical edge key – smaller string first so (A,B) === (B,A).
function makeEdgeKey(a: Axial, b: Axial): string {
  const ka = `${a.q},${a.r}`
  const kb = `${b.q},${b.r}`
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
}

// Returns the two world-space vertex positions that form the shared edge
// between hex a and its neighbour b.
function getEdgeVertices(
  a: Axial,
  b: Axial,
  size: number,
): [{ x: number; y: number }, { x: number; y: number }] {
  const center = hexToPixel(a.q, a.r, size)
  const dq = b.q - a.q
  const dr = b.r - a.r
  const dirIdx = NEIGHBOR_DIRS.findIndex((d) => d.q === dq && d.r === dr)
  const i = dirIdx === -1 ? 0 : dirIdx
  const startAngle = -Math.PI / 6
  return [
    {
      x: center.x + size * Math.cos(startAngle + (i * Math.PI) / 3),
      y: center.y + size * Math.sin(startAngle + (i * Math.PI) / 3),
    },
    {
      x: center.x + size * Math.cos(startAngle + ((i + 1) * Math.PI) / 3),
      y: center.y + size * Math.sin(startAngle + ((i + 1) * Math.PI) / 3),
    },
  ]
}

// Given a world-space point, returns the nearest hex edge as two adjacent axial cells.
function nearestEdge(worldX: number, worldY: number): { a: Axial; b: Axial } {
  const frac = pixelToAxial(worldX, worldY, HEX_SIZE)
  const a = roundAxial(frac)
  let minDist = Infinity
  let bestDir = NEIGHBOR_DIRS[0]
  for (const d of NEIGHBOR_DIRS) {
    const nb = { q: a.q + d.q, r: a.r + d.r }
    const c = hexToPixel(nb.q, nb.r, HEX_SIZE)
    const dist = (worldX - c.x) ** 2 + (worldY - c.y) ** 2
    if (dist < minDist) {
      minDist = dist
      bestDir = d
    }
  }
  return { a, b: { q: a.q + bestDir.q, r: a.r + bestDir.r } }
}

export function HexViewport({
  onZoomChange,
  selectedTerrainId,
  terrainDefinitions,
  locationDefinitions,
  selectedLocationId,
  activeTool,
  terrainTiles,
  setTerrainTiles,
  locationTiles,
  setLocationTiles,
  riverEdges,
  setRiverEdges,
}: HexViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const selectedTerrainRef = useRef(selectedTerrainId)
  const selectedLocationRef = useRef(selectedLocationId)
  const activeToolRef = useRef(activeTool)
  const localTerrainTilesRef = useRef<Map<string, string>>(new Map(terrainTiles))
  const localLocationTilesRef = useRef<Map<string, string>>(new Map(locationTiles))
  const localRiverEdgesRef = useRef<Set<string>>(new Set(riverEdges))
  const needsRedrawRef = useRef(true)

  useEffect(() => {
    selectedTerrainRef.current = selectedTerrainId
  }, [selectedTerrainId])

  useEffect(() => {
    selectedLocationRef.current = selectedLocationId
  }, [selectedLocationId])

  useEffect(() => {
    activeToolRef.current = activeTool
  }, [activeTool])

  // Sync prop changes to local refs
  useEffect(() => {
    localTerrainTilesRef.current = new Map(terrainTiles)
    needsRedrawRef.current = true
  }, [terrainTiles])

  useEffect(() => {
    localLocationTilesRef.current = new Map(locationTiles)
    needsRedrawRef.current = true
  }, [locationTiles])

  useEffect(() => {
    localRiverEdgesRef.current = new Set(riverEdges)
    needsRedrawRef.current = true
  }, [riverEdges])

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
      const iconLayer = new Container()
      const locationLayer = new Container()
      const grid = new Graphics()
      const hover = new Graphics()
      grid.setStrokeStyle({ width: 1.5, color: 0x2f445f, alpha: 0.95 })
      const terrainById = new Map(terrainDefinitions.map((terrain) => [terrain.id, terrain]))
      const terrainIconById = new Map<string, Texture>()
      const locationIconById = new Map<string, Texture>()

      await Promise.all([
        ...terrainDefinitions.map(async (terrain) => {
          const texture = (await Assets.load(terrain.iconPath)) as Texture
          terrainIconById.set(terrain.id, texture)
        }),
        ...locationDefinitions.map(async (loc) => {
          const texture = (await Assets.load(loc.iconPath)) as Texture
          locationIconById.set(loc.id, texture)
        }),
      ])

      const riverLayer = new Graphics()

      world.addChild(terrainLayer)
      world.addChild(iconLayer)
      world.addChild(locationLayer)
      world.addChild(grid)
      world.addChild(riverLayer)
      world.addChild(hover)

      world.position.set(app.renderer.width / 2, app.renderer.height / 2)

      let isPanning = false
      let isPaintingStroke = false
      let lastX = 0
      let lastY = 0
      let currentZoom = 1

      const redrawVisibleGrid = () => {
        terrainLayer.clear()
        iconLayer.removeChildren().forEach((child) => child.destroy())
        locationLayer.removeChildren().forEach((child) => child.destroy())
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
            const key = makeCellKey(q, r)

            const terrainId = localTerrainTilesRef.current.get(key)
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

                const iconTexture = terrainIconById.get(terrainId)
                if (iconTexture && !localLocationTilesRef.current.has(key)) {
                  const icon = new Sprite(iconTexture)
                  icon.anchor.set(0.5)
                  icon.position.set(Math.round(center.x), Math.round(center.y))
                  icon.roundPixels = true
                  icon.width = HEX_SIZE
                  icon.height = HEX_SIZE
                  icon.alpha = 0.95
                  iconLayer.addChild(icon)
                }
              }
            }

            const locationId = localLocationTilesRef.current.get(key)
            if (locationId) {
              const locTexture = locationIconById.get(locationId)
              if (locTexture) {
                const loc = new Sprite(locTexture)
                loc.anchor.set(0.5)
                loc.position.set(Math.round(center.x), Math.round(center.y))
                loc.roundPixels = true
                // Location icon is slightly smaller so terrain icon is still visible underneath
                loc.width = HEX_SIZE * 0.72
                loc.height = HEX_SIZE * 0.72
                locationLayer.addChild(loc)
              }
            }

            drawHexTile(grid, center.x, center.y, HEX_SIZE)
          }
        }

        grid.stroke()

        // Draw rivers over the grid lines
        riverLayer.clear()
        if (localRiverEdgesRef.current.size > 0) {
          riverLayer.setStrokeStyle({ width: 4, color: 0x2288ee, alpha: 0.92 })
          for (const edgeKey of localRiverEdgesRef.current) {
            const [part1, part2] = edgeKey.split('|')
            const [aq, ar] = part1.split(',').map(Number)
            const [bq, br] = part2.split(',').map(Number)
            const [v0, v1] = getEdgeVertices({ q: aq, r: ar }, { q: bq, r: br }, HEX_SIZE)
            riverLayer.moveTo(v0.x, v0.y)
            riverLayer.lineTo(v1.x, v1.y)
          }
          riverLayer.stroke()
        }
      }

      const maybeRedrawGrid = () => {
        if (!needsRedrawRef.current) {
          return
        }

        redrawVisibleGrid()
        needsRedrawRef.current = false
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

        hover.clear()

        if (activeToolRef.current === 'river' || activeToolRef.current === 'erase-river') {
          const { a, b } = nearestEdge(worldX, worldY)
          const [v0, v1] = getEdgeVertices(a, b, HEX_SIZE)
          hover.setStrokeStyle({ width: 5, color: 0x77d5ff, alpha: 0.9 })
          hover.moveTo(v0.x, v0.y)
          hover.lineTo(v1.x, v1.y)
          hover.stroke()
        } else {
          const fractional = pixelToAxial(worldX, worldY, HEX_SIZE)
          const cell = roundAxial(fractional)
          const center = hexToPixel(cell.q, cell.r, HEX_SIZE)
          hover.setStrokeStyle({ width: 2.5, color: 0x77d5ff, alpha: 0.95 })
          drawHexTile(hover, center.x, center.y, HEX_SIZE)
          hover.stroke()
        }
      }

      const paintEdgeAtScreen = (screenX: number, screenY: number) => {
        const local = screenToCanvas(screenX, screenY)
        if (!local) return
        const worldX = (local.x - world.position.x) / currentZoom
        const worldY = (local.y - world.position.y) / currentZoom
        const { a, b } = nearestEdge(worldX, worldY)
        const edgeKey = makeEdgeKey(a, b)
        if (activeToolRef.current === 'erase-river') {
          localRiverEdgesRef.current.delete(edgeKey)
        } else {
          localRiverEdgesRef.current.add(edgeKey)
        }
        setRiverEdges(new Set(localRiverEdgesRef.current))
        needsRedrawRef.current = true
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
          localTerrainTilesRef.current.delete(key)
          localLocationTilesRef.current.delete(key)
        } else if (activeToolRef.current === 'erase-location') {
          localLocationTilesRef.current.delete(key)
        } else if (activeToolRef.current === 'location') {
          if (!localTerrainTilesRef.current.has(key)) return
          localLocationTilesRef.current.set(key, selectedLocationRef.current)
        } else {
          localTerrainTilesRef.current.set(key, selectedTerrainRef.current)
        }
        
        setTerrainTiles(new Map(localTerrainTilesRef.current))
        setLocationTiles(new Map(localLocationTilesRef.current))
        needsRedrawRef.current = true
      }

      redrawVisibleGrid()
      onZoomChange?.(currentZoom)

      const updateZoomAtPoint = (localX: number, localY: number, nextZoom: number) => {
        const beforeX = (localX - world.position.x) / currentZoom
        const beforeY = (localY - world.position.y) / currentZoom

        world.scale.set(nextZoom)
        world.position.set(localX - beforeX * nextZoom, localY - beforeY * nextZoom)

        currentZoom = nextZoom
        needsRedrawRef.current = true
        onZoomChange?.(currentZoom)
      }

      const onPointerDown = (event: PointerEvent) => {
        if (event.button === 0) {
          if (activeToolRef.current === 'move') {
            isPanning = true
            lastX = event.clientX
            lastY = event.clientY
          } else if (activeToolRef.current === 'river' || activeToolRef.current === 'erase-river') {
            isPaintingStroke = true
            paintEdgeAtScreen(event.clientX, event.clientY)
            highlightHoveredHex(event.clientX, event.clientY)
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
          if (activeToolRef.current === 'river' || activeToolRef.current === 'erase-river') {
            paintEdgeAtScreen(event.clientX, event.clientY)
          } else {
            paintCellAtScreen(event.clientX, event.clientY)
          }
        }

        if (isPanning) {
          world.position.x += event.clientX - lastX
          world.position.y += event.clientY - lastY
          needsRedrawRef.current = true

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
        needsRedrawRef.current = true
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
  }, [onZoomChange, terrainDefinitions, locationDefinitions])

  return <div className="viewport" ref={hostRef} />
}
