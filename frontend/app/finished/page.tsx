import { FinishedClient, type FinishedEntry } from './FinishedClient';
import { fetchList } from '@/lib/serverApi';

export default async function FinishedPage() {
  return <FinishedClient initial={await fetchList<FinishedEntry[]>('/api/finished', 300)} />;
}
