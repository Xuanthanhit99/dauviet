import type {Metadata} from "next";
import "./globals.css";

const siteUrl=process.env.NEXT_PUBLIC_SITE_URL??"https://dauvietweb-production.up.railway.app";

export const metadata:Metadata={
 metadataBase:new URL(siteUrl),
 title:{default:"Dấu Việt Global — Khám phá nơi chốn, hiểu câu chuyện",template:"%s | Dấu Việt Global"},
 description:"Khám phá nơi chốn, con người, văn hóa và lịch sử qua câu chuyện có nguồn, bản đồ và hành trình.",
 alternates:{canonical:"/"},
 openGraph:{type:"website",locale:"vi_VN",siteName:"Dấu Việt Global",title:"Dấu Việt Global — Khám phá nơi chốn, hiểu câu chuyện",description:"Khám phá nơi chốn, con người, văn hóa và lịch sử qua câu chuyện có nguồn, bản đồ và hành trình.",url:"/"},
 robots:{index:true,follow:true},
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body><a className="skip-link" href="#main">Bỏ qua đến nội dung</a>{children}</body></html>}
