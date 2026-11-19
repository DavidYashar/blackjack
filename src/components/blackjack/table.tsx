/**
 * The table under the cards. Everything here is drawn: gradients, an arc for the
 * dealer's line, a soft vignette and the rail at the edge. No images, so it stays
 * crisp at any screen density and costs nothing to load.
 */
export function TableFelt({ rail = true }: { rail?: boolean } = {}) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* felt */}
      <div className="absolute inset-0 bg-[radial-gradient(140%_95%_at_50%_-12%,#1c6f49_0%,#124f35_42%,#0a3122_72%,#061e15_100%)]" />

      {/* grain */}
      <div className="absolute inset-0 opacity-[0.05] [background-image:radial-gradient(#ffffff_0.6px,transparent_0.6px)] [background-size:5px_5px]" />

      {/* dealer arc */}
      <svg
        className="absolute inset-x-0 top-[13%] h-[19%] w-full"
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
      >
        <path
          d="M 6 28 Q 50 6 94 28"
          fill="none"
          stroke="rgba(201,151,63,0.22)"
          strokeWidth="0.35"
        />
        <path
          d="M 10 28 Q 50 9 90 28"
          fill="none"
          stroke="rgba(201,151,63,0.10)"
          strokeWidth="0.25"
        />
      </svg>

      {/* vignette, so the edges fall away */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_85%_at_50%_45%,transparent_45%,rgba(0,0,0,0.55)_100%)]" />

      {/* rail, for the game; a page leaves it off */}
      {rail ? (
        <div className="absolute inset-x-0 bottom-0 h-[19%] rounded-t-[26px] border-t border-black/50 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.45))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />
      ) : null}
    </div>
  );
}
