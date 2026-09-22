import CountryDetail from "./country-detail";

export default async function CountryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CountryDetail slug={slug} />;
}
