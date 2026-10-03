import type {MetadataRoute} from "next";
export default function sitemap():MetadataRoute.Sitemap{
 const base=(process.env.NEXT_PUBLIC_SITE_URL??"https://dauvietweb-production.up.railway.app").replace(/\/$/,"");
 const routes=["","/explore","/map","/stories","/journeys"];
 return routes.map(path=>({url:`${base}${path}`,changeFrequency:path===""?"weekly":"daily",priority:path===""?1:0.8}));
}
