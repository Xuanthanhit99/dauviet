import DestinationDetail from "./destination-detail";

export default async function DestinationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DestinationDetail slug={slug} />;
}
