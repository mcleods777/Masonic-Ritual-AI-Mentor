/**
 * Pilot build banner. Thin ribbon across the top of the app, only shown
 * when PILOT_MODE=true in the environment. Server component so it adds
 * zero JS to the bundle.
 *
 * This is a trust contract, not a technical control. Brothers in the
 * pilot are expected to read it and act accordingly.
 */

export default function PilotBanner() {
  if (process.env.PILOT_MODE !== "true") return null;

  return (
    <div
      role="status"
      className="w-full bg-amber-950/80 border-b border-amber-800 text-amber-100 text-center text-xs py-2 px-4 tracking-wide"
    >
      PILOT BUILD — pending Grand Lodge review. Please do not share outside the pilot group.
    </div>
  );
}
