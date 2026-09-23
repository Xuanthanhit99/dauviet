import PersonDetail from "./person-detail";
import "./person.css";

export default async function PersonPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = query.locale === "en" ? "en" : "vi";
  return <PersonDetail key={`${slug}-${locale}`} slug={slug} locale={locale} />;
}
