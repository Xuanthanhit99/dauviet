import { DetailJsonLd } from "../../components/detail-jsonld";
import { detailMetadata } from "../../components/detail-metadata";
import { ConsumerShell } from "../../components/consumer-shell";
import RegionDetail from "./region-detail";
import "./region.css";

export async function generateMetadata({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{locale?:string}>}){const [{slug},q]=await Promise.all([params,searchParams]);const locale=q.locale==="en"?"en":"vi";return detailMetadata("regions",slug,locale,"Vùng");}

export default async function RegionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = query.locale === "en" ? "en" : "vi";
  return <ConsumerShell><DetailJsonLd kind="regions" slug={slug} locale={locale} /><RegionDetail key={`${slug}-${locale}`} slug={slug} locale={locale} /></ConsumerShell>;
}
