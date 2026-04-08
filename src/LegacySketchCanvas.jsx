export default function LegacySketchCanvas({
  sketchCanvasRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onDoubleClick,
  width,
  height,
  visibleSelectionFrame,
}) {
  return (
    <div style={{ position: 'relative', width: `${width}px`, height: `${height}px` }}>
      <canvas
        ref={sketchCanvasRef}
        className="rt-sketch-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={onDoubleClick}
      />

      {visibleSelectionFrame && (
        <div
          style={{
            position: 'absolute',
            left: `${visibleSelectionFrame.left}px`,
            top: `${visibleSelectionFrame.top}px`,
            width: `${visibleSelectionFrame.right - visibleSelectionFrame.left}px`,
            height: `${visibleSelectionFrame.bottom - visibleSelectionFrame.top}px`,
            border: '2px dashed rgba(37, 99, 235, 0.95)',
            borderRadius: '12px',
            pointerEvents: 'none',
            boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  )
}
