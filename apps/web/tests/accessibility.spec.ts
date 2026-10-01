import {expect,test} from "@playwright/test";

const routes=["/","/map","/explore","/stories","/journeys","/book"];

test.describe("Phase 8 accessibility baseline",()=>{
  for(const route of routes){
    test(`${route} exposes keyboard focus without horizontal overflow`,async({page})=>{
      await page.goto(route);
      await page.keyboard.press("Tab");
      const focused=page.locator(":focus");
      await expect(focused).toBeVisible();
      const outline=await focused.evaluate(el=>getComputedStyle(el).outlineStyle);
      expect(outline).not.toBe("none");
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
    });
  }

  test("reduced motion disables smooth scrolling and long transitions",async({browser})=>{
    const context=await browser.newContext({reducedMotion:"reduce"});
    const page=await context.newPage();
    await page.goto("/");
    expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
    const maxMotion=await page.locator("body *").evaluateAll(nodes=>nodes.reduce((max,node)=>{
      const style=getComputedStyle(node);
      const seconds=(value:string)=>value.split(",").reduce((m,item)=>Math.max(m,parseFloat(item)||0),0);
      return Math.max(max,seconds(style.animationDuration),seconds(style.transitionDuration));
    },0));
    expect(maxMotion).toBeLessThanOrEqual(.01);
    await context.close();
  });
});
