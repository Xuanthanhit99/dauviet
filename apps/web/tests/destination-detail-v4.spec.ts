import { expect, test } from "@playwright/test";

const destination = {
  id:"dest-1",slug:"ha-noi",type:"CULTURAL_CITY",importance:90,
  country:{id:"vn",slug:"viet-nam",iso2:"VN"},region:{id:"r1",slug:"dong-bang-song-hong"},city:{id:"c1",slug:"ha-noi"},
  location:{latitude:21.0278,longitude:105.8342},heroMedia:null,
  translation:{name:"Hà Nội",tagline:"Dấu vết thời gian giữa một đô thị sống",summary:"Một điểm đến được kể qua nơi chốn, sự kiện và câu chuyện.",description:"Nội dung mô tả đã xuất bản.",whyVisit:"Khám phá các lớp thời gian và kết nối lịch sử."},
  themes:[{id:"t1",slug:"lich-su",category:"HISTORY",name:"Lịch sử"}],
  places:[{id:"p1",slug:"hoang-thanh",name:"Hoàng thành",type:"HERITAGE_SITE",role:"ANCHOR",isFeatured:true}],
  stories:[{id:"s1",slug:"mot-cau-chuyen",title:"Một câu chuyện",summary:"Tóm tắt câu chuyện."}],
  journeys:[{id:"j1",slug:"mot-hanh-trinh",title:"Một hành trình"}],
  historicalTurningPoints:[{id:"e1",slug:"mot-su-kien",title:"Một sự kiện",date:{display:"Thế kỷ XI"},role:"TURNING_POINT"}],
  related:[],meta:{requestedLocale:"vi",resolvedLocale:"vi",fallbackApplied:false}
};
const fulfill=(page:any,data:any=destination,status=200)=>page.route("**/v1/destinations/**",(r:any)=>r.fulfill({status,contentType:"application/json",body:JSON.stringify(status===200?{success:true,data}:{success:false,error:{message:"Không tìm thấy điểm đến."}})}));

for(const vp of [{n:"mobile",width:390,height:844},{n:"tablet",width:834,height:1112},{n:"desktop",width:1536,height:960}]){
 test(`Destination V4 responsive ${vp.n}`,async({page})=>{await fulfill(page);await page.setViewportSize(vp);await page.goto("/destinations/ha-noi");await expect(page.getByRole("heading",{name:"Hà Nội",level:1})).toBeVisible();await expect(page.getByRole("heading",{name:"Những nơi tạo nên điểm đến"})).toBeVisible();await expect(page.getByRole("heading",{name:"Những bước ngoặt theo thời gian"})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();});
}
test("Destination V4 composition and links",async({page})=>{await fulfill(page);await page.goto("/destinations/ha-noi");await expect(page.getByText("Hoàng thành")).toBeVisible();await expect(page.getByText("Một sự kiện")).toBeVisible();await expect(page.getByText("Một câu chuyện")).toBeVisible();await expect(page.getByText("Một hành trình")).toBeVisible();await expect(page.getByRole("link",{name:/Hoàng thành/})).toHaveAttribute("href","/places/hoang-thanh");});
test("Destination V4 explicit empty sections and fallback",async({page})=>{await fulfill(page,{...destination,places:[],stories:[],journeys:[],historicalTurningPoints:[],meta:{requestedLocale:"en",resolvedLocale:"vi",fallbackApplied:true}});await page.goto("/destinations/ha-noi");await expect(page.getByText("Ngôn ngữ dự phòng: vi")).toBeVisible();await expect(page.getByText("Chưa có nội dung đã xuất bản trong phần này.")).toHaveCount(3);await expect(page.getByText("Chưa có bước ngoặt lịch sử đã xuất bản.")).toBeVisible();});
test("Destination V4 API error",async({page})=>{await fulfill(page,null,404);await page.goto("/destinations/khong-ton-tai");await expect(page.getByRole("heading",{name:"Không thể mở điểm đến"})).toBeVisible();await expect(page.getByText("Không tìm thấy điểm đến.")).toBeVisible();});
test("Destination V4 keyboard and reduced motion",async({page})=>{await fulfill(page);await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/destinations/ha-noi");const jump=page.getByRole("link",{name:"Hiểu điểm đến"});await jump.focus();await expect(jump).toBeFocused();expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");});
