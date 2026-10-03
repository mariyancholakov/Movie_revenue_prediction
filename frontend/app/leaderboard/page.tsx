import { LeaderboardClient, type LeaderboardEntry } from './LeaderboardClient';
import { fetchList } from '@/lib/serverApi';

export default async function LeaderboardPage() {
  const ranked = await fetchList<LeaderboardEntry[]>('/api/leaderboard', 120);
  return <LeaderboardClient initial={{ ranked }} />;
}
