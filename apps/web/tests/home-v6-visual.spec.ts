import {expect,test} from "@playwright/test";
for(const viewport of [{name:"mobile-390",width:390,height:844},{name:"desktop-1536",width:1536,height:960}]){
 test("Home V6 visual evidence — "+viewport.name,async({page})=>{
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await page.goto("/",{waitUntil:"networkidle"});
  await expect(page.locator(".home-v6")).toBeVisible();
  await expect(page.getByText("Đi để khám phá.",{exact:false}).first()).toBeVisible();
  await expect(page.getByText("Lên kế hoạch hành trình của bạn",{exact:true})).toBeVisible();
  await expect(page.getByText("Một nơi,",{exact:false}).first()).toBeVisible();
  await expect(page.locator(".home-v6-search")).toBeVisible();
  if(viewport.width>960) await expect(page.locator(".home-v6-nav nav")).toBeVisible();
  await page.screenshot({path:"qa-evidence/home-v6/home-v6-"+viewport.name+".png",fullPage:true,animations:"disabled"});
 });
}