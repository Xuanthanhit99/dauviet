import {expect,test} from "@playwright/test";

test("auth routes expose accessible account lifecycle",async({page})=>{
 await page.goto("/auth/login"); await expect(page.getByRole("heading",{name:"Đăng nhập"})).toBeVisible();
 await expect(page.getByLabel("Email")).toBeVisible(); await expect(page.getByLabel("Mật khẩu")).toBeVisible();
 await page.goto("/auth/register"); await expect(page.getByRole("heading",{name:"Tạo tài khoản"})).toBeVisible();
 await page.goto("/auth/forgot-password"); await expect(page.getByRole("heading",{name:"Quên mật khẩu"})).toBeVisible();
 await page.goto("/auth/reset-password"); await expect(page.getByRole("heading",{name:"Đặt lại mật khẩu"})).toBeVisible();
});

test("forgot password keeps enumeration-safe confirmation",async({page})=>{
 await page.route("**/v1/auth/request-password-reset",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({success:true,data:{accepted:true}})}));
 await page.goto("/auth/forgot-password"); await page.getByLabel("Email").fill("someone@example.com"); await page.getByRole("button",{name:"Gửi hướng dẫn"}).click();
 await expect(page.getByRole("status")).toContainText("Nếu email tồn tại");
});

test("account redirects when refresh session is unavailable",async({page})=>{
 await page.route("**/v1/auth/refresh",route=>route.fulfill({status:401,contentType:"application/json",body:JSON.stringify({success:false,error:{code:"UNAUTHENTICATED",message:"Unauthenticated"}})}));
 await page.goto("/account"); await expect(page.getByRole("heading",{name:"Phiên đăng nhập đã hết"})).toBeVisible();
});
