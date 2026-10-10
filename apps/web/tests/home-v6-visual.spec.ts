import {expect,test} from "@playwright/test";
import fs from "node:fs/promises";

for(const viewport of [{name:"mobile-390",width:390,height:844},{name:"desktop-1536",width:1536,height:960}]){
 test("Home V6 visual evidence — "+viewport.name,async({page})=>{
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  let editorialHomePayload:any = null;
  let editorialHomeResponse:any = null;
  const mediaResponses:any[] = [];
  page.on("response", async(response)=>{
    if(response.url().includes("/v1/editorial/home")){
      try {
        editorialHomeResponse = {url:response.url(),status:response.status()};
        editorialHomePayload = await response.json();
      } catch {}
      return;
    }
    if(!response.url().includes("/v1/media/test-public")) return;
    try {
      const headers=response.headers();
      const body=await response.body();
      mediaResponses.push({
        url:response.url(),
        status:response.status(),
        contentType:headers["content-type"]??null,
        contentLength:headers["content-length"]??null,
        bodyBytes:body.byteLength,
        bodyPrefix:Array.from(body.subarray(0,16)),
      });
    } catch(error) {
      mediaResponses.push({url:response.url(),status:response.status(),error:String(error)});
    }
  });
  await page.goto("/",{waitUntil:"domcontentloaded"});
  await expect(page.locator(".home-v6")).toBeVisible();

  // Data-ready gate: networkidle alone is not sufficient for this client-rendered home.
  await expect.poll(async()=>await page.locator(".journey-card").count(),{timeout:15000}).toBeGreaterThan(0);
  await expect.poll(async()=>await page.locator(".destination-strip > a").count(),{timeout:15000}).toBeGreaterThan(0);
  await expect.poll(async()=>await page.locator(".story-card").count(),{timeout:15000}).toBeGreaterThan(0);

  await expect.poll(()=>editorialHomePayload,{timeout:15000}).not.toBeNull();
  await fs.writeFile(
    test.info().outputPath("home-v6-editorial-home-payload.json"),
    JSON.stringify({response:editorialHomeResponse,payload:editorialHomePayload},null,2),
    "utf8"
  );

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
  const backgroundUrls=await page.locator(".home-v6-hero, .journey-card .media, .destination-strip > a, .story-card").evaluateAll(nodes=>nodes.flatMap((node:any)=>{
    const bg=getComputedStyle(node).backgroundImage;
    const match=bg.match(/url\(["']?([^"')]+)["']?\)/);
    return match?[match[1]]:[];
  }));
  expect(backgroundUrls.length).toBeGreaterThan(0);
  expect(backgroundUrls.some(url=>url.includes("Ha_Long_Bay_in_Vietnam.jpg")), "Stale Home V6 hero media URL detected").toBe(false);
  const mediaHttpDiagnostics=await Promise.all([...new Set(backgroundUrls)].map(async(url)=>{
    try {
      const response=await page.request.get(url);
      const body=await response.body();
      return {
        url,
        status:response.status(),
        contentType:response.headers()["content-type"]??null,
        contentLength:response.headers()["content-length"]??null,
        bodyBytes:body.byteLength,
        bodyPrefix:Array.from(body.subarray(0,16)),
      };
    } catch(error) {
      return {url,error:String(error)};
    }
  }));
  await fs.writeFile(
    test.info().outputPath("home-v6-media-request-diagnostics.json"),
    JSON.stringify(mediaHttpDiagnostics,null,2),
    "utf8"
  );
  const backgroundLoads=await page.evaluate(async(urls:string[])=>await Promise.all(urls.map(url=>new Promise<boolean>(resolve=>{
    const img=new Image();
    img.onload=()=>resolve(img.naturalWidth>0);
    img.onerror=()=>resolve(false);
    img.src=url;
  }))),backgroundUrls);
  const backgroundFailures=backgroundUrls.filter((_,i)=>!backgroundLoads[i]);
  await fs.writeFile(
    test.info().outputPath("home-v6-media-responses.json"),
    JSON.stringify(mediaResponses,null,2),
    "utf8"
  );
  expect(backgroundFailures, "Broken Home V6 background media: "+JSON.stringify(backgroundFailures)).toHaveLength(0);

  // Smoke-test the three core content paths without mutating the current page.
  const destinationHref=await page.locator(".destination-strip > a").first().getAttribute("href");
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
