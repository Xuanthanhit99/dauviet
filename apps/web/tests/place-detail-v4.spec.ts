import { expect, test, type Page, type Route } from "@playwright/test";

const place={id:"p1",slug:"co-loa",type:"ARCHAEOLOGICAL_SITE",publicationStatus:"PUBLISHED",currentCountry:{id:"vn",slug:"viet-nam",iso2:"VN"},currentRegion:{id:"r1",slug:"dong-bang-song-hong"},currentCity:{id:"c1",slug:"ha-noi"},parentPlace:null,heroMedia:null,location:{latitude:21.114,longitude:105.872},translation:{name:"Cổ Loa",summary:"Một địa điểm có nhiều lớp thời gian.",description:"Mô tả địa điểm đã xuất bản."},meta:{requestedLocale:"vi",resolvedLocale:"vi",fallbackApplied:false}};
const timeline=[{id:"e1",slug:"su-kien-co-loa",title:"Một bước ngoặt lịch sử",date:{display:"Thế kỷ III TCN"}}];
const stories=[{id:"s1",slug:"cau-chuyen-co-loa",title:"Câu chuyện Cổ Loa",summary:"Tóm tắt đã xuất bản."}];
const journeys=[{id:"j1",slug:"hanh-trinh-co-loa",title:"Hành trình Cổ Loa"}];
const sources=[{id:"src1",title:"Nguồn tham chiếu",publisher:"Nhà xuất bản"}];
const media=[{id:"m1",url:null,caption:"Tư liệu Cổ Loa",provenanceType:"ARCHIVE",rightsStatus:"CLEARED"}];
const community=[{id:"c1",slug:"goc-nhin-co-loa",type:"MEMORY",verificationState:"VERIFIED",title:"Góc nhìn cộng đồng"}];

async function mockPlace(page:Page,overrides:{place?:any;timeline?:any[];stories?:any[];journeys?:any[];sources?:any[];media?:any[];community?:any[];error?:boolean}={}){
 await page.route("**/v1/places/**",async(route:Route)=>{
  if(overrides.error){await route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({success:false,error:{message:"Không tìm thấy địa điểm."}})});return}
  const u=new URL(route.request().url());let data:any;
  if(u.pathname.endsWith("/timeline"))data=overrides.timeline??timeline;
  else if(u.pathname.endsWith("/stories"))data=overrides.stories??stories;
  else if(u.pathname.endsWith("/journeys"))data=overrides.journeys??journeys;
  else if(u.pathname.endsWith("/sources"))data=overrides.sources??sources;
  else if(u.pathname.endsWith("/media"))data=overrides.media??media;
  else if(u.pathname.endsWith("/community"))data=overrides.community??community;
  else data=overrides.place??place;
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({success:true,data})});
 });
}
for(const vp of [{n:"mobile",width:390,height:844},{n:"tablet",width:834,height:1112},{n:"desktop",width:1536,height:960}]){
 test(`Place V4 responsive ${vp.n}`,async({page})=>{await mockPlace(page);await page.setViewportSize(vp);await page.goto("/places/co-loa");await expect(page.getByRole("heading",{name:"Cổ Loa",level:1})).toBeVisible();await expect(page.getByRole("heading",{name:"Dòng thời gian của địa điểm"})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();});
}
test("Place V4 pillars and relationships",async({page})=>{await mockPlace(page);await page.goto("/places/co-loa");await expect(page.getByText("Một bước ngoặt lịch sử")).toBeVisible();await expect(page.getByText("Tư liệu Cổ Loa")).toBeVisible();await expect(page.getByText("ARCHIVE · CLEARED")).toBeVisible();await expect(page.locator("#stories").getByRole("heading",{name:"Câu chuyện Cổ Loa"})).toBeVisible();await expect(page.locator("#journeys").getByRole("heading",{name:"Hành trình Cổ Loa"})).toBeVisible();await expect(page.getByText("Nguồn tham chiếu")).toBeVisible();await expect(page.getByText("Góc nhìn cộng đồng")).toBeVisible();});
test("Place V4 explicit empty and locale fallback states",async({page})=>{await mockPlace(page,{place:{...place,meta:{requestedLocale:"en",resolvedLocale:"vi",fallbackApplied:true}},timeline:[],stories:[],journeys:[],sources:[],media:[],community:[]});await page.goto("/places/co-loa");await expect(page.getByText("Ngôn ngữ dự phòng: vi")).toBeVisible();await expect(page.getByText("Chưa có sự kiện đã xuất bản.")).toBeVisible();await expect(page.getByText("Chưa có media đã xuất bản.")).toBeVisible();await expect(page.getByText("Chưa có nguồn công khai được liên kết.")).toBeVisible();await expect(page.getByText("Chưa có câu chuyện cộng đồng đủ điều kiện hiển thị.")).toBeVisible();});
test("Place V4 API error",async({page})=>{await mockPlace(page,{error:true});await page.goto("/places/khong-ton-tai");await expect(page.getByRole("heading",{name:"Không thể mở địa điểm"})).toBeVisible();await expect(page.getByText("Không tìm thấy địa điểm.")).toBeVisible();});
test("Place V4 keyboard focus and reduced motion",async({page})=>{await mockPlace(page);await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/places/co-loa");const link=page.getByRole("link",{name:"Hiểu địa điểm"});await link.focus();await expect(link).toBeFocused();expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");});
