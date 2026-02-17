import { useRef, useState, useCallback, useEffect } from "react";
import { Eraser, Eye, EyeOff, Check } from "lucide-react";

interface CharacterCanvasProps {
  /** The target character to practice drawing */
  targetGlyph: string;
  /** Latin transliteration shown below */
  latinHint: string;
  /** Size of the canvas in px */
  size?: number;
}

export function CharacterCanvas({ targetGlyph, latinHint, size = 160 }: CharacterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Draw guide character on canvas
  const drawGuide = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.font = `${size * 0.6}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(128, 128, 128, 0.12)";
    ctx.fillText(targetGlyph, size / 2, size / 2);
    ctx.restore();
  }, [targetGlyph, size]);

  // Draw revealed character (solid)
  const drawRevealed = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.font = `${size * 0.6}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(34, 197, 94, 0.6)";
    ctx.fillText(targetGlyph, size / 2, size / 2);
    ctx.restore();
  }, [targetGlyph, size]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set up for high-DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, size, size);
    if (showGuide) drawGuide(ctx);
  }, [size, showGuide, drawGuide]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);
    if (revealed) setRevealed(false);

    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    if (showGuide) drawGuide(ctx);
    setHasDrawn(false);
    setRevealed(false);
  };

  const toggleGuide = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // We need to save the drawing, toggle guide, and restore
    // Simplest: just clear and redraw guide (drawing is lost) — or use ImageData
    const dpr = window.devicePixelRatio || 1;
    const imageData = ctx.getImageData(0, 0, size * dpr, size * dpr);
    ctx.clearRect(0, 0, size, size);
    if (!showGuide) drawGuide(ctx);
    // Composite the user's strokes back on top
    // Actually, toggling guide mid-drawing is complex. Let's just toggle for next clear.
    setShowGuide(!showGuide);
  };

  const revealAnswer = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawRevealed(ctx);
    setRevealed(true);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Target character label */}
      <div className="text-center">
        <span className="text-2xl font-bold">{targetGlyph}</span>
        <span className="text-sm text-muted-foreground ml-2">({latinHint})</span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, touchAction: "none" }}
        className="rounded-lg border-2 border-foreground/20 bg-foreground/[0.03] cursor-crosshair"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={clearCanvas}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-foreground/20 hover:bg-foreground/10 transition-colors"
          title="Törlés"
        >
          <Eraser className="w-3 h-3" />
          Törlés
        </button>
        <button
          onClick={toggleGuide}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-foreground/20 hover:bg-foreground/10 transition-colors"
          title={showGuide ? "Segédlet elrejtése" : "Segédlet mutatása"}
        >
          {showGuide ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showGuide ? "Rejtés" : "Segéd"}
        </button>
        {hasDrawn && !revealed && (
          <button
            onClick={revealAnswer}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/10 transition-colors"
            title="Megoldás"
          >
            <Check className="w-3 h-3" />
            Ellenőrzés
          </button>
        )}
      </div>
    </div>
  );
}
