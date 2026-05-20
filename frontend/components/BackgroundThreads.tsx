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
        <path d="M -60 175 C 80 55, 265 215, 345 88" fill="none" stroke="#28DC88" strokeWidth="1.4" strokeLinecap="round" opacity="0.28" />
      </g>
      {/* top-left small green loop */}
      <g className="thread thread-2">
        <path d="M 35 318 C 80 260, 108 322, 168 270" fill="none" stroke="#28DC88" strokeWidth="0.9" strokeLinecap="round" opacity="0.2" />
      </g>
      {/* bottom-left pink arc */}
      <g className="thread thread-3">
        <path d="M 48 838 C 108 752, 195 814, 308 732" fill="none" stroke="#DC287C" strokeWidth="1.2" strokeLinecap="round" opacity="0.24" />
      </g>
      {/* bottom-left pink squiggle */}
      <g className="thread thread-4">
        <path d="M 138 924 C 170 868, 150 828, 208 794" fill="none" stroke="#DC287C" strokeWidth="0.8" strokeLinecap="round" opacity="0.18" />
      </g>
      {/* top-right ghost arc */}
      <g className="thread thread-5">
        <path d="M 1378 -28 C 1318 82, 1398 190, 1330 264" fill="none" stroke="rgba(220,244,233,1)" strokeWidth="1.1" strokeLinecap="round" opacity="0.17" />
      </g>
      {/* right-side pink */}
      <g className="thread thread-6">
        <path d="M 1484 360 C 1404 432, 1450 514, 1376 580" fill="none" stroke="#DC287C" strokeWidth="1.1" strokeLinecap="round" opacity="0.2" />
      </g>
      {/* right lower green */}
      <g className="thread thread-7">
        <path d="M 1460 644 C 1380 704, 1418 774, 1354 824" fill="none" stroke="#28DC88" strokeWidth="1" strokeLinecap="round" opacity="0.2" />
      </g>
      {/* left-middle purple */}
      <g className="thread thread-8">
        <path d="M -52 490 C 70 540, 50 614, 122 660" fill="none" stroke="#7B3FAF" strokeWidth="1.5" strokeLinecap="round" opacity="0.26" />
      </g>
    </svg>
  );
}
