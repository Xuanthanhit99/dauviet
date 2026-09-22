import JourneyDetail from "./journey-detail";
export default async function JourneyPage({params}:{params:Promise<{slug:string}>}){const{slug}=await params;return <JourneyDetail slug={slug}/>}
