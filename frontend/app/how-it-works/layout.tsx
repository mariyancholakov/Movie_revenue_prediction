import type { Metadata } from 'next';

// The page itself is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: 'How It Works',
  description: 'How MOVIEGROSS turns a US opening weekend into a predicted worldwide total, worked through for a film now playing.',
};

export default function HowItWorksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
