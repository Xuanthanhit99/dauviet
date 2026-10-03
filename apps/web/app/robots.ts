import type {MetadataRoute} from "next";
export default function robots():MetadataRoute.Robots{
 const base=process.env.NEXT_PUBLIC_SITE_URL??"https://dauvietweb-production.up.railway.app";
 return {rules:[{userAgent:"*",allow:"/",disallow:["/account","/auth/","/contribute"]}],sitemap:`${base.replace(/\/$/,"")}/sitemap.xml`};
}
