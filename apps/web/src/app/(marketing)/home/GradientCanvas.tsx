/**
 * Soft, flowing mesh-gradient background — layered blurred color fields that
 * slowly drift (see landing.css `.grad-*`). Pure CSS so it composites reliably
 * everywhere and stays light; the flowing look is driven by keyframed transforms
 * and is frozen under prefers-reduced-motion. `palette`/`base` are accepted for
 * API compatibility; the per-variant colors live in the stylesheet.
 */
export function GradientCanvas({
  className,
}: {
  className?: string;
  palette?: [number, number, number, number];
  base?: number;
}) {
  return <div className={className} aria-hidden="true" />;
}
