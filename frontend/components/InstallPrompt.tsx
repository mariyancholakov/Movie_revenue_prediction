'use client';
import { useEffect, useRef, useState } from 'react';

// A sheet that slides up from the bottom of a phone, a few seconds into a
// visit, offering to put the site on the home screen. It never shows to
// someone who already runs it from the home screen, and stays away for a
// few days once dismissed. Android hands over a
// real install prompt; iPhone allows none, so the sheet says where to tap.
const DISMISSED = 'mg-install-dismissed';
const SNOOZE = 5 * 24 * 60 * 60 * 1000;
const DELAY = 4000;

// Chrome's install prompt event, which TypeScript doesn't know.
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}

const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIPhone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

// The share glyph Safari prints on its button: a box with an arrow rising.
function ShareGlyph() {
  return (
    <svg aria-hidden width="16" height="18" viewBox="0 0 16 18" className="inline-block align-[-3px] mx-0.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 11V1.5M4.5 5 8 1.5 11.5 5M3.5 7.5H2.5v9h11v-9h-1" />
    </svg>
  );
}

export function InstallPrompt() {
  const [show, setShow] = useState<'android' | 'iphone' | null>(null);
  const [desktop, setDesktop] = useState(false);
  const offered = useRef<InstallEvent | null>(null);

  useEffect(() => {
    // never inside a frame, nor on the embed page itself (it lives in other people's pages)
    if (window.self !== window.top || window.location.pathname.startsWith('/embed')) return;
    if (isInstalled()) return;
    const dismissedAt = Number(read(DISMISSED));
    if (dismissedAt && Date.now() - dismissedAt < SNOOZE) return;
    setDesktop(!window.matchMedia('(pointer: coarse)').matches);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = (kind: 'android' | 'iphone') => {
      clearTimeout(timer);
      timer = setTimeout(() => setShow(kind), DELAY);
    };

    const onPrompt = (e: Event) => {
      e.preventDefault();
      offered.current = e as InstallEvent;
      open('android');
    };
    // an offer that came before this ran (kept by the script in layout.tsx)
    const early = (window as Window & { __installEvent?: Event }).__installEvent;
    if (early) onPrompt(early);
    const onInstalled = () => { write(DISMISSED, String(Date.now() * 2)); setShow(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (isIPhone()) open('iphone');

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show]);

  function dismiss() {
    write(DISMISSED, String(Date.now()));
    setShow(null);
  }

  async function install() {
    const event = offered.current;
    if (!event) return dismiss();
    setShow(null);
    await event.prompt();
    const { outcome } = await event.userChoice;
    // an accepted install fires appinstalled; a refusal counts as a dismissal
    if (outcome === 'dismissed') write(DISMISSED, String(Date.now()));
  }

  if (!show) return null;
  return (
    <div
      role="dialog"
      aria-label={desktop ? 'Install MOVIEGROSS' : 'Add MOVIEGROSS to your home screen'}
      className="install-sheet fixed inset-x-0 bottom-0 z-50 bg-paper border-t-2 border-ink px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-12px_rgba(28,24,20,0.35)] md:inset-x-auto md:right-6 md:bottom-6 md:w-[26rem] md:border-2 md:pb-5 md:shadow-[6px_6px_0_0_rgba(28,24,20,0.9)]"
    >
      <div className="max-w-md mx-auto">
        <p className="font-display text-ink text-[1.25rem] font-bold leading-[1.15] m-0">
          {desktop ? 'Keep MOVIEGROSS one click away' : 'Keep MOVIEGROSS on your home screen'}
        </p>
        <p className="font-sans text-ink2 text-[0.88rem] leading-[1.55] mt-2 mb-4">
          {show === 'iphone' ? (
            <>
              It opens full-screen and instantly, and the last edition works without signal. Tap <ShareGlyph /> Share
              in Safari&rsquo;s toolbar, then <strong className="text-ink">Add to Home Screen</strong>.
            </>
          ) : (
            `It opens ${desktop ? 'in its own window' : 'full-screen'} and instantly, and the last edition works without signal.`
          )}
        </p>
        <div className="flex items-center gap-3">
          {show === 'android' && (
            <button onClick={install} className="ledger-btn font-sans text-[0.8rem] font-semibold tracking-[0.08em] indent-[0.08em] px-5 py-3 cursor-pointer">
              INSTALL
            </button>
          )}
          <button
            onClick={dismiss}
            className={show === 'android'
              ? 'font-sans text-[0.8rem] font-semibold tracking-[0.08em] text-ink2 bg-transparent border-0 px-3 py-3 cursor-pointer'
              : 'ledger-btn font-sans text-[0.8rem] font-semibold tracking-[0.08em] indent-[0.08em] px-5 py-3 cursor-pointer'}
          >
            {show === 'android' ? 'NOT NOW' : 'GOT IT'}
          </button>
        </div>
      </div>
    </div>
  );
}
