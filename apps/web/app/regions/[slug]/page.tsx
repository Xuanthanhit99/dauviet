import RegionDetail from "./region-detail";
import "./region.css";

export default async function RegionPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return <RegionDetail slug={slug} locale={query.locale === "en" ? "en" : "vi"} />;
}
