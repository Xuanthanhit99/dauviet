import { expect, test, type Page, type Route } from "@playwright/test";

const story={id:"s1",slug:"thanh-co-va-ky-uc",type:"HISTORICAL_NARRATIVE",byline:"Ban biên tập",publishedAt:"2026-09-20T00:00:00.000Z",featured:true,priority:10,editorialStatus:"PUBLISHED",heroMedia:{id:"m1",type:"RECONSTRUCTION",isHistorical:true,isAiGenerated:true,aiDisclosure:"Tái dựng có công bố",accessPolicy:"PUBLIC",status:"READY"},places:[{id:"p1",slug:"co-loa",role:"SETTING"}],people:[{id:"pe1",slug:"an-duong-vuong",role:"SUBJECT"}],events:[{id:"e1",slug:"su-kien-co-loa",role:"SUBJECT"}],facts:[{id:"f1",factType:"FOUNDING",certainty:"PROBABLE",editorialStatus:"PUBLISHED"}],citations:[{id:"cit1",source:{id:"src1",title:"Nguồn khảo cứu"},pageFrom:12,pageTo:14,locator:"Chương 2"}],translation:{title:"Thành cổ và ký ức",subtitle:"Đọc một địa điểm qua nhiều lớp thời gian",summary:"Một câu chuyện có nguồn và quan hệ lịch sử.",content:[{type:"heading",level:2,text:"Một lớp thời gian"},{type:"paragraph",text:"Nội dung kể chuyện đã xuất bản."},{type:"quote",text:"Một trích dẫn trong câu chuyện.",attribution:"Tư liệu",citationId:"cit1"},{type:"source_reference",citationId:"cit1",label:"Đọc nguồn khảo cứu"},{type:"entity_reference",entityKind:"PLACE",entityId:"p1",text:"Cổ Loa"},{type:"callout",style:"disclosure",text:"Thông tin công bố phương pháp."},{type:"image",mediaAssetId:"m2",caption:"Ảnh tham chiếu trong bài."}]},meta:{requestedLocale:"vi",resolvedLocale:"vi",fallbackApplied:false}};
async function mock(page:Page,data:any=story,status=200){await page.route("**/v1/media/**", route => route.fulfill({status:404,json:{error:{message:"Media unavailable"}}}));await page.route("**/v1/stories/**",async(route:Route)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(status===200?{success:true,data}:{success:false,error:{message:"Không tìm thấy câu chuyện."}})}))}
for(const vp of [{name:"mobile",width:390,height:844},{name:"tablet",width:834,height:1112},{name:"desktop",width:1536,height:960}])test(`Story Explorer responsive ${vp.name}`,async({page})=>{await mock(page);await page.setViewportSize(vp);await page.goto("/stories/thanh-co-va-ky-uc");await expect(page.getByRole("heading",{name:"Thành cổ và ký ức",level:1})).toBeVisible();await expect(page.getByRole("article",{name:"Nội dung câu chuyện"})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy()});
test("renders structured story, citations, connections and evidence",async({page})=>{await mock(page);await page.goto("/stories/thanh-co-va-ky-uc");await expect(page.getByText("Nội dung kể chuyện đã xuất bản.")).toBeVisible();await expect(page.getByText("Một trích dẫn trong câu chuyện.")).toBeVisible();await expect(page.getByRole("link",{name:"Xem nguồn"})).toHaveAttribute("href","#citation-cit1");await expect(page.getByRole("link",{name:"Đọc nguồn khảo cứu"})).toHaveAttribute("href","#citation-cit1");await expect(page.getByRole("link",{name:/^co-loa/})).toHaveAttribute("href","/places/co-loa");await expect(page.getByRole("link",{name:/an-duong-vuong/})).toHaveAttribute("href","/people/an-duong-vuong");await expect(page.getByRole("link",{name:/su-kien-co-loa/})).toHaveAttribute("href","/events/su-kien-co-loa");await expect(page.getByText("FOUNDING · PROBABLE")).toBeVisible();await expect(page.getByText("Nguồn khảo cứu",{exact:true})).toBeVisible()});
test("discloses historical AI media without inventing URL",async({page})=>{await mock(page);await page.goto("/stories/thanh-co-va-ky-uc");await expect(page.getByText("Historical media")).toBeVisible();await expect(page.getByText("AI / Reconstruction: Tái dựng có công bố")).toBeVisible();await expect(page.locator(".story-hero img")).toHaveCount(0)});
test("supports empty body and locale fallback",async({page})=>{await mock(page,{...story,translation:{...story.translation,content:[]},meta:{requestedLocale:"en",resolvedLocale:"vi",fallbackApplied:true},citations:[],facts:[],places:[],people:[],events:[]});await page.goto("/stories/thanh-co-va-ky-uc");await expect(page.getByText("Câu chuyện chưa có nội dung đã xuất bản.")).toBeVisible();await expect(page.getByText("Ngôn ngữ dự phòng: vi")).toBeVisible();await expect(page.getByText("Chưa có citation công khai được liên kết.")).toBeVisible()});
test("renders public API error state",async({page})=>{await mock(page,null,404);await page.goto("/stories/khong-ton-tai");await expect(page.getByRole("heading",{name:"Không thể mở câu chuyện"})).toBeVisible();await expect(page.getByText("Không tìm thấy câu chuyện.")).toBeVisible()});
test("keyboard citation navigation and reduced motion",async({page})=>{await mock(page);await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/stories/thanh-co-va-ky-uc");const link=page.getByRole("link",{name:"Xem nguồn"});await link.focus();await expect(link).toBeFocused();expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto")});

test("citation keyboard round trip and unknown references", async ({ page }) => {
  await mock(page, { ...story, translation: { ...story.translation, content: [...story.translation.content, { type: "source_reference", citationId: "missing", label: "Nguồn chưa có" }] } });
  await page.goto("/stories/thanh-co-va-ky-uc");
  const reference = page.getByRole("link", { name: "Xem nguồn", exact: true });
  await reference.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#citation-cit1")).toBeFocused();
  await page.getByRole("link", { name: "Quay lại đoạn đang đọc" }).focus();
  await page.keyboard.press("Enter");
  await expect(reference).toBeFocused();
  await expect(page.getByText("Nguồn chưa có — Nguồn tham chiếu chưa được cung cấp.")).toBeVisible();
  await expect(page.locator('a[href="#sources"]')).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Cổ Loa", exact: true })).toHaveAttribute("href", "/places/co-loa");
});

test("loading, retry and empty connections", async ({ page }) => {
  let requests = 0;
  await page.route("**/v1/stories/**", async route => {
    requests += 1;
    if (requests === 1) return route.fulfill({ status: 503, json: { error: { message: "Tạm thời gián đoạn." } } });
    await route.fulfill({ json: { data: { ...story, places: [], people: [], events: [], facts: [] } } });
  });
  await page.goto("/stories/thanh-co-va-ky-uc");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Tạm thời gián đoạn.");
  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(page.getByRole("heading", { name: story.translation.title, exact: true })).toBeVisible();
  await expect(page.getByText("Chưa có kết nối được công bố.")).toBeVisible();
  await expect(page.getByText("Chưa có dữ kiện lịch sử được liên kết.")).toBeVisible();
});

test("long source text, audio fallback and reading language", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, { ...story, meta: { requestedLocale: "vi", resolvedLocale: "en", fallbackApplied: true }, citations: [{ ...story.citations[0], source: { id: "src1", title: "LongSource".repeat(45) } }], translation: { ...story.translation, content: [...story.translation.content, { type: "audio", mediaAssetId: "audio1", caption: "Âm thanh tham chiếu" }] } });
  await page.goto("/stories/thanh-co-va-ky-uc");
  await expect(page.getByRole("article", { name: "Nội dung câu chuyện" })).toHaveAttribute("lang", "en");
  await expect(page.getByText("Âm thanh tham chiếu")).toBeVisible();
  await expect(page.locator("audio, .story-page img")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
});


const media = { id: "m1", type: "ARCHIVAL_PHOTO", status: "READY", accessPolicy: "PUBLIC", mimeType: "image/png", isHistorical: true, isAiGenerated: false, url: "https://media.example.test/exact-m1.png", rightsStatus: "LICENSED", license: "QA license", provenanceNote: "QA provenance only", creatorName: "QA creator", altText: "QA archival image", caption: "QA caption" };

test("resolves exact media with provenance and refuses restricted media", async ({ page }) => {
  await mock(page);
  await page.route("**/v1/media/m1", route => route.fulfill({ json: { data: media } }));
  await page.route("https://media.example.test/exact-m1.png", route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64") }));
  await page.goto("/stories/thanh-co-va-ky-uc");
  await expect(page.getByRole("img", { name: "QA archival image" })).toHaveAttribute("src", media.url);
  await expect(page.getByText("Nguồn gốc: QA provenance only")).toBeVisible();
  await expect(page.getByText("Quyền sử dụng: QA license")).toBeVisible();
  await page.route("**/v1/media/m1", route => route.fulfill({ json: { data: { ...media, accessPolicy: "METADATA_ONLY" } } }));
  await page.reload();
  await expect(page.getByText("Nguồn gốc: QA provenance only")).toBeVisible();
  await expect(page.locator(".story-hero img")).toHaveCount(0);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 834, height: 1112 }, { width: 1536, height: 960 }]) {
  test(`Story reading screenshot ${viewport.width}`, async ({ page }, testInfo) => {
    await mock(page);
    await page.setViewportSize(viewport);
    await page.goto("/stories/thanh-co-va-ky-uc");
    await expect(page.getByRole("heading", { name: story.translation.title, exact: true })).toBeVisible();
    await expect(page.getByText("Đang tải media…")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`story-${viewport.width}.png`), fullPage: true });
  });
}
