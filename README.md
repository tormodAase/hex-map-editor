# hex-map-editor

Hex map editor prototype focused on whiteboard-like camera navigation.

## Current Implementation

- React + TypeScript + Vite frontend.
- PixiJS rendering pipeline.
- Infinite-style hex field (large generated grid).
- Drag-to-pan viewport interaction.
- Cursor-centered wheel and trackpad zoom.
- Zoom HUD percentage display.

## Run

1. Install dependencies:

   npm install

2. Start local dev server:

   npm run dev

3. Build for production:

   npm run build

## Next Milestones

- Tile painting and eraser tools.
- Axial/cube coordinate utility module.
- Selection and multi-tile operations.
- Undo/redo command history.
- Import/export JSON map format with schema versioning.
