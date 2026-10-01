import {expect,test} from "@playwright/test";

test.describe("Phase 8 admin accessibility baseline",()=>{
  test.beforeEach(async({page})=>{
    await page.route("**/v1/auth/refresh",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({accessToken:"qa-token"})}));
    await page.route("**/v1/users/me",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({id:"qa-admin",email:"qa@example.test",displayName:"QA Admin",roles:["ADMIN"]})}));
  });

  test("keyboard focus is visible",async({page})=>{
    await page.goto("/");
    const focusable=page.locator('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])').filter({visible:true}).first();
    await expect(focusable).toBeVisible();
    await focusable.focus();
    await expect(focusable).toBeFocused();
    const focusStyle=await focusable.evaluate(el=>{
      const style=getComputedStyle(el);
      return {outlineStyle:style.outlineStyle,outlineWidth:style.outlineWidth};
    });
    expect(focusStyle.outlineStyle).not.toBe("none");
    expect(parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);
  });

  test("reduced motion removes long animation and transitions",async({browser})=>{
    const context=await browser.newContext({reducedMotion:"reduce"});
    const page=await context.newPage();
    await page.route("**/v1/auth/refresh",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({accessToken:"qa-token"})}));
    await page.route("**/v1/users/me",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({id:"qa-admin",email:"qa@example.test",displayName:"QA Admin",roles:["ADMIN"]})}));
    await page.goto("/");
    const maxMotion=await page.locator("body *").evaluateAll(nodes=>nodes.reduce((max,node)=>{
      const style=getComputedStyle(node);
      const seconds=(value:string)=>value.split(",").reduce((m,item)=>Math.max(m,parseFloat(item)||0),0);
      return Math.max(max,seconds(style.animationDuration),seconds(style.transitionDuration));
    },0));
    expect(maxMotion).toBeLessThanOrEqual(.01);
    await context.close();
  });
});
