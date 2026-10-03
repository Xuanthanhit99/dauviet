import { ConsumerShell } from "../../components/consumer-shell";
import CountryDetail from "./country-detail";

export default async function CountryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = query.locale === "en" ? "en" : "vi";
  return <ConsumerShell><CountryDetail key={`${slug}-${locale}`} slug={slug} locale={locale} /></ConsumerShell>;
}
