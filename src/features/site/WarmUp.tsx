'use client';
// Home page: once it's idle, get the map ready in the background (its page and
// code, the map style, and Indore's crowd data with the IIM campus), so
// opening the map feels instant.
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { config } from '@/lib/config';

export function WarmUp() {
  const router = useRouter();
  useEffect(() => {
    const go = () => {
      router.prefetch('/map');
      void fetch(`/api/crowd?city=${config.defaultCity}`).catch(() => {});
      void fetch(config.map.styleUrl, { mode: 'cors' }).catch(() => {});
      void fetch('/api/cities').catch(() => {});
    };
    // Wait until the page is idle so the globe and search come first.
    const id = window.setTimeout(go, 1500);
    return () => clearTimeout(id);
  }, [router]);
  return null;
}
