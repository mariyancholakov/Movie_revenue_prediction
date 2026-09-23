// Typewriter figure: one span per character plus a block caret. Rendered
// fully typed, so reduced motion and SSR show the plain figure; the reveal
// timeline hides the [data-char]s and strikes them back one at a time.
export function Typed({ text }: { text: string }) {
  return (
    <span aria-label={text} className="whitespace-nowrap">
      {[...text].map((ch, i) => (
        <span key={i} data-char aria-hidden>{ch}</span>
      ))}
      <span
        data-caret
        aria-hidden
        className="inline-block w-[0.55em] h-[0.95em] bg-current align-[-0.1em] ml-[0.08em] opacity-0"
      />
    </span>
  );
}

// Loading state: a line filed on the typewriter, then a blinking caret.
export function TypedLoader() {
  const line = 'FILING THE NUMBERS';
  return (
    <p className="font-mono text-[0.8rem] sm:text-[0.9rem] tracking-[0.16em] text-ink m-0 flex items-center">
      <span
        className="inline-block overflow-hidden whitespace-nowrap"
        style={{ width: `calc(${line.length}ch + ${line.length * 0.16}em)`, animation: `typeOn 1.1s steps(${line.length}) both` }}
      >
        {line}
      </span>
      <span
        aria-hidden
        className="inline-block w-[0.6em] h-[1.1em] bg-ink ml-1"
        style={{ animation: 'caretBlink 0.9s steps(1) infinite' }}
      />
    </p>
  );
}
