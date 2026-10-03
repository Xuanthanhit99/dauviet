import { ConsumerShell } from "../../components/consumer-shell";
import DestinationDetail from "./destination-detail";

export default async function DestinationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = query.locale === "en" ? "en" : "vi";
  return <ConsumerShell><DestinationDetail key={`${slug}-${locale}`} slug={slug} locale={locale} /></ConsumerShell>;
}
