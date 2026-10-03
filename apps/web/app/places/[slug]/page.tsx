import { ConsumerShell } from "../../components/consumer-shell";
import PlaceDetail from "./place-detail";

export default async function PlacePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = query.locale === "en" ? "en" : "vi";
  return <ConsumerShell><PlaceDetail key={`${slug}-${locale}`} slug={slug} locale={locale} /></ConsumerShell>;
}
