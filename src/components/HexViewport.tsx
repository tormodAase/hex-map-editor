import { useEffect, useRef } from 'react'
import { Application, Container, Graphics } from 'pixi.js'

type HexViewportProps = {
  onZoomChange?: (zoom: number) => void
}

const SQRT3 = Math.sqrt(3)
const HEX_SIZE = 36
const MIN_ZOOM = 0.05
const MAX_ZOOM = 3
const ZOOM_SENSITIVITY = 0.005
const REDRAW_EPSILON = 0.0001

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

export function HexViewport({ onZoomChange }: HexViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)

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

      const grid = new Graphics()
      const hover = new Graphics()
      grid.setStrokeStyle({ width: 1.5, color: 0x2f445f, alpha: 0.95 })

      world.addChild(grid)
      world.addChild(hover)

      world.position.set(app.renderer.width / 2, app.renderer.height / 2)

      let isDragging = false
      let lastX = 0
      let lastY = 0
      let currentZoom = 1
      let needsRedraw = true
      let lastRedrawState = {
        x: world.position.x,
        y: world.position.y,
        zoom: currentZoom,
        width: app.renderer.width,
        height: app.renderer.height,
      }

      const redrawVisibleGrid = () => {
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
            drawHexTile(grid, center.x, center.y, HEX_SIZE)
          }
        }

        grid.stroke()
      }

      const maybeRedrawGrid = () => {
        if (!needsRedraw) {
          return
        }

        const hasCameraMoved =
          Math.abs(lastRedrawState.x - world.position.x) > REDRAW_EPSILON ||
          Math.abs(lastRedrawState.y - world.position.y) > REDRAW_EPSILON ||
          Math.abs(lastRedrawState.zoom - currentZoom) > REDRAW_EPSILON

        const hasViewportChanged =
          lastRedrawState.width !== app.renderer.width ||
          lastRedrawState.height !== app.renderer.height

        if (!hasCameraMoved && !hasViewportChanged) {
          return
        }

        redrawVisibleGrid()
        lastRedrawState = {
          x: world.position.x,
          y: world.position.y,
          zoom: currentZoom,
          width: app.renderer.width,
          height: app.renderer.height,
        }
        needsRedraw = false
      }

      const highlightHoveredHex = (screenX: number, screenY: number) => {
        const rect = app.canvas.getBoundingClientRect()
        const localX = screenX - rect.left
        const localY = screenY - rect.top

        if (
          localX < 0 ||
          localY < 0 ||
          localX > app.renderer.width ||
          localY > app.renderer.height
        ) {
          hover.clear()
          return
        }

        const worldX = (localX - world.position.x) / currentZoom
        const worldY = (localY - world.position.y) / currentZoom
        const fractional = pixelToAxial(worldX, worldY, HEX_SIZE)
        const cell = roundAxial(fractional)
        const center = hexToPixel(cell.q, cell.r, HEX_SIZE)

        hover.clear()
        hover.setStrokeStyle({ width: 2.5, color: 0x77d5ff, alpha: 0.95 })
        drawHexTile(hover, center.x, center.y, HEX_SIZE)
        hover.stroke()
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
        if (event.button !== 0) {
          return
        }

        isDragging = true
        lastX = event.clientX
        lastY = event.clientY
      }

      const onPointerMove = (event: PointerEvent) => {
        highlightHoveredHex(event.clientX, event.clientY)

        if (!isDragging) {
          return
        }

        world.position.x += event.clientX - lastX
        world.position.y += event.clientY - lastY
        needsRedraw = true

        lastX = event.clientX
        lastY = event.clientY
      }

      const onPointerUp = () => {
        isDragging = false
      }

      const onWheel = (event: WheelEvent) => {
        event.preventDefault()

        const rect = app.canvas.getBoundingClientRect()
        const localX = event.clientX - rect.left
        const localY = event.clientY - rect.top

        if (
          localX < 0 ||
          localY < 0 ||
          localX > app.renderer.width ||
          localY > app.renderer.height
        ) {
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

        updateZoomAtPoint(localX, localY, nextZoom)
      }

      app.canvas.addEventListener('pointerdown', onPointerDown)
      app.canvas.addEventListener('wheel', onWheel, { passive: false })
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('pointercancel', onPointerUp)
      app.stage.eventMode = 'static'
      app.ticker.add(maybeRedrawGrid)

      const onResize = () => {
        if (!hostRef.current) {
          return
        }

        const rect = hostRef.current.getBoundingClientRect()
        app.renderer.resize(rect.width, rect.height)
      }

      window.addEventListener('resize', onResize)

      return () => {
        app.canvas.removeEventListener('pointerdown', onPointerDown)
        app.canvas.removeEventListener('wheel', onWheel)
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerUp)
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
  }, [onZoomChange])

  return <div className="viewport" ref={hostRef} />
}
