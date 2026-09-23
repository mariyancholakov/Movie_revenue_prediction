import type { Metadata } from 'next';

// The page itself is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: 'Rankings',
  description: "Every priced film now playing, ranked by the model's predicted worldwide run.",
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
