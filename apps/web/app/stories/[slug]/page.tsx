import { ConsumerShell } from "../../components/consumer-shell";
import StoryExplorer from "./story-explorer";

export default async function StoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = query.locale === "en" ? "en" : "vi";
  return <ConsumerShell><StoryExplorer key={`${slug}-${locale}`} slug={slug} locale={locale} /></ConsumerShell>;
}
