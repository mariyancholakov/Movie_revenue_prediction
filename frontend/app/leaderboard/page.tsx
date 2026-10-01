import { LeaderboardClient, type LeaderboardEntry } from './LeaderboardClient';
import { fetchList } from '@/lib/serverApi';

type Id = { tmdb_id: number };

export default async function LeaderboardPage() {
  const [ranked, playing, settled] = await Promise.all([
    fetchList<LeaderboardEntry[]>('/api/leaderboard', 120),
    fetchList<Id[]>('/api/now-playing', 300),
    fetchList<Id[]>('/api/finished', 300),
  ]);
  return (
    <LeaderboardClient
      initial={{
        ranked,
        playing: playing && playing.map(f => f.tmdb_id),
        settled: settled && settled.map(f => f.tmdb_id),
      }}
    />
  );
}
