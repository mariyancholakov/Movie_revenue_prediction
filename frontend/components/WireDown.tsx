// The "can't reach the API" state, shared by every page that loads from it.
// Reader-facing on purpose: no hostnames or setup instructions.
export function WireDown({ className = '' }: { className?: string }) {
  return (
    <div className={`border border-ink/25 bg-panel/50 px-6 py-8 text-center ${className}`}>
      <p className="font-display text-ink text-lg font-bold mb-1.5">The wire is down</p>
      <p className="text-ink2 text-[0.85rem] leading-relaxed m-0">
        We couldn&rsquo;t reach the box-office desk just now. Please check
        your connection and reload in a moment.
      </p>
    </div>
  );
}
