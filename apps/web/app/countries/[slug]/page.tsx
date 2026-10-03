import { detailMetadata } from "../../components/detail-metadata";
import { ConsumerShell } from "../../components/consumer-shell";
import CountryDetail from "./country-detail";

export async function generateMetadata({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{locale?:string}>}){const [{slug},q]=await Promise.all([params,searchParams]);const locale=q.locale==="en"?"en":"vi";return detailMetadata("countries",slug,locale,"Quốc gia");}

export default async function CountryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = query.locale === "en" ? "en" : "vi";
  return <ConsumerShell><CountryDetail key={`${slug}-${locale}`} slug={slug} locale={locale} /></ConsumerShell>;
}
