import type { Metadata } from 'next';
import { RunClient } from './RunClient';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function RunPage() {
  return <RunClient />;
}
