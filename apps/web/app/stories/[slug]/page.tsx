import StoryExplorer from "./story-explorer";
export default async function StoryPage({params}:{params:Promise<{slug:string}>}){const{slug}=await params;return <StoryExplorer slug={slug}/>}
