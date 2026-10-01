import "maplibre-gl/dist/maplibre-gl.css";
import JourneyDetail from "./journey-detail";

export default async function JourneyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = query.locale === "en" ? "en" : "vi";
  return <JourneyDetail key={`${slug}-${locale}`} slug={slug} locale={locale}/>;
}
