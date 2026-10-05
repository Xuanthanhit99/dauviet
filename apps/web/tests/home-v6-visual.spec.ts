import {expect,test} from "@playwright/test";

for(const viewport of [{name:"mobile-390",width:390,height:844},{name:"desktop-1536",width:1536,height:960}]){
 test("Home V6 visual evidence — "+viewport.name,async({page})=>{
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await page.goto("/",{waitUntil:"domcontentloaded"});
  await expect(page.locator(".home-v6")).toBeVisible();

  // Data-ready gate: networkidle alone is not sufficient for this client-rendered home.
  await expect.poll(async()=>await page.locator(".journey-card").count(),{timeout:15000}).toBeGreaterThan(0);
  await expect.poll(async()=>await page.locator(".destination-grid > a").count(),{timeout:15000}).toBeGreaterThan(0);
  await expect.poll(async()=>await page.locator(".story-card").count(),{timeout:15000}).toBeGreaterThan(0);

  await expect(page.getByText("Đi để khám phá.",{exact:false}).first()).toBeVisible();
  await expect(page.getByText("Lên kế hoạch hành trình của bạn",{exact:true})).toBeVisible();
  await expect(page.locator(".home-v6-search")).toBeVisible();

  // Content media gate: UI chrome (logo/icon) is intentionally excluded.
  await page.locator(".context-thumb img").evaluateAll(async(nodes:any[])=>Promise.all(nodes.map((img:any)=>img.complete?Promise.resolve():new Promise<void>(resolve=>{img.addEventListener("load",()=>resolve(),{once:true});img.addEventListener("error",()=>resolve(),{once:true});}))));
  const contentImages=await page.locator(".context-thumb img").evaluateAll((nodes:any[])=>nodes.map((img:any)=>({
    src:img.currentSrc||img.src,
    complete:img.complete,
    naturalWidth:img.naturalWidth,
    naturalHeight:img.naturalHeight
  })));
  const brokenContentImages=contentImages.filter((x:any)=>!x.complete||x.naturalWidth<=0||x.naturalHeight<=0);
  expect(brokenContentImages, "Broken Home V6 content <img>: "+JSON.stringify(brokenContentImages)).toHaveLength(0);
  const backgroundUrls=await page.locator(".home-v6-hero, .journey-card .media, .destination-grid > a, .story-card").evaluateAll(nodes=>nodes.flatMap((node:any)=>{
    const bg=getComputedStyle(node).backgroundImage;
    const match=bg.match(/url\(["']?([^"')]+)["']?\)/);
    return match?[match[1]]:[];
  }));
  expect(backgroundUrls.length).toBeGreaterThan(0);
  const backgroundLoads=await page.evaluate(async(urls:string[])=>await Promise.all(urls.map(url=>new Promise<boolean>(resolve=>{
    const img=new Image();
    img.onload=()=>resolve(img.naturalWidth>0);
    img.onerror=()=>resolve(false);
    img.src=url;
  }))),backgroundUrls);
  const backgroundFailures=backgroundUrls.filter((_,i)=>!backgroundLoads[i]);
  expect(backgroundFailures, "Broken Home V6 background media: "+JSON.stringify(backgroundFailures)).toHaveLength(0);

  // Smoke-test the three core content paths without mutating the current page.
  const destinationHref=await page.locator(".destination-grid > a").first().getAttribute("href");
  const journeyHref=await page.locator(".journey-card").first().getAttribute("href");
  const storyHref=await page.locator(".story-card").first().getAttribute("href");
  for(const href of [destinationHref,journeyHref,storyHref]){
    expect(href).toBeTruthy();
    const detail=await page.request.get(new URL(href!,page.url()).toString());
    expect(detail.status()).toBeLessThan(400);
  }

  if(viewport.width>960) await expect(page.locator(".home-v6-nav nav")).toBeVisible();
  await page.screenshot({path:"qa-evidence/home-v6/home-v6-"+viewport.name+".png",fullPage:true,animations:"disabled"});
 });
}
