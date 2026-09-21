import PlaceDetail from "./place-detail";

export default async function PlacePage({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  return <PlaceDetail slug={slug}/>;
}
