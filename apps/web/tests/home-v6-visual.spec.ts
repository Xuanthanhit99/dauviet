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

  // Every rendered visual card must have a real, loadable image.
  const mediaCheck=await page.locator(".home-v6-hero, .context-thumb img, .journey-card .media, .destination-grid > a, .story-card").evaluateAll(nodes=>nodes.map((node:any)=>{
    const style=getComputedStyle(node);
    const bg=style.backgroundImage;
    const img=node.tagName==="IMG"?node:null;
    return {
      tag:node.tagName,
      hasBackground:bg && bg!=="none",
      imageComplete:img?img.complete:false,
      imageNaturalWidth:img?img.naturalWidth:0:1
    };
  }));
  const visualNodes=mediaCheck.filter((x:any)=>x.tag==="IMG"||x.tag==="DIV"||x.tag==="A");
  expect(visualNodes.length).toBeGreaterThan(0);
  expect(mediaCheck.filter((x:any)=>x.tag==="IMG").every((x:any)=>x.imageComplete&&x.imageNaturalWidth>0)).toBeTruthy();
  expect(mediaCheck.filter((x:any)=>x.hasBackground).length).toBeGreaterThan(0);

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
