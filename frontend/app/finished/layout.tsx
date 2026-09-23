import type { Metadata } from 'next';

// The page itself is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: 'The Ledger',
  description: "Finished theatrical runs: the model's prediction settled against the final worldwide gross.",
};

export default function FinishedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
