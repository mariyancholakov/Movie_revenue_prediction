export function BackgroundThreads() {
  return (
    <svg
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* top-left green arc */}
      <g className="thread thread-1">
        <path d="M -60 175 C 80 55, 265 215, 345 88" fill="none" stroke="#28DC88" strokeWidth="5.5" strokeLinecap="round" opacity="0.22" />
      </g>
      {/* bottom-left pink arc */}
      <g className="thread thread-2">
        <path d="M 48 838 C 108 752, 195 814, 308 732" fill="none" stroke="#DC287C" strokeWidth="5" strokeLinecap="round" opacity="0.2" />
      </g>
      {/* top-right cream arc */}
      <g className="thread thread-3">
        <path d="M 1378 -28 C 1318 82, 1398 190, 1330 264" fill="none" stroke="#DCF4E9" strokeWidth="4.8" strokeLinecap="round" opacity="0.14" />
      </g>
      {/* right-side pink */}
      <g className="thread thread-4">
        <path d="M 1484 360 C 1404 432, 1450 514, 1376 580" fill="none" stroke="#DC287C" strokeWidth="4.8" strokeLinecap="round" opacity="0.18" />
      </g>
      {/* left-middle purple */}
      <g className="thread thread-5">
        <path d="M -52 490 C 70 540, 50 614, 122 660" fill="none" stroke="#7B3FAF" strokeWidth="5.5" strokeLinecap="round" opacity="0.22" />
      </g>
    </svg>
  );
}
