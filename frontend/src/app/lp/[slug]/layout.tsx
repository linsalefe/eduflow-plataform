import type { Metadata } from 'next';

const INTERNAL_API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

async function getLPData(slug: string) {
  try {
    const res = await fetch(`${INTERNAL_API}/lp/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getLPData(slug);

  if (!data) {
    return { title: 'Página não encontrada' };
  }

  const config = data.config || {};
  const heroSection = config.sections?.find((s: any) => s.id === 'hero' && s.enabled);

  const title = heroSection?.data?.title || config.heroTitle || data.title;
  const description = heroSection?.data?.subtitle || config.heroSubtitle || `Saiba mais sobre ${data.title}`;
  const ogImage = config.heroImageUrl || config.logoUrl || '';

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://portal.eduflowia.com';
  const pageUrl = `${baseUrl}/lp/${slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      type: 'website',
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    robots: { index: true, follow: true },
  };
}

export default function LPLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}