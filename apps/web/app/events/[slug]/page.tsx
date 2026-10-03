import { DetailJsonLd } from "../../components/detail-jsonld";
import { detailMetadata } from "../../components/detail-metadata";
import { ConsumerShell } from "../../components/consumer-shell";
import EventDetail from "./event-detail";
import "./event.css";

export async function generateMetadata({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{locale?:string}>}){const [{slug},q]=await Promise.all([params,searchParams]);const locale=q.locale==="en"?"en":"vi";return detailMetadata("events",slug,locale,"Sự kiện");}

export default async function EventPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = query.locale === "en" ? "en" : "vi";
  return <ConsumerShell><DetailJsonLd kind="events" slug={slug} locale={locale} /><EventDetail key={`${slug}-${locale}`} slug={slug} locale={locale} /></ConsumerShell>;
}
