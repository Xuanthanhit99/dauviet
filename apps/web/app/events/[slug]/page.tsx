import EventDetail from "./event-detail";
import "./event.css";

export default async function EventPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = query.locale === "en" ? "en" : "vi";
  return <EventDetail key={`${slug}-${locale}`} slug={slug} locale={locale} />;
}
