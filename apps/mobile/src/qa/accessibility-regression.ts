import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import assert from "node:assert/strict";

// Dedicated Phase 8 native accessibility contract gate.
if(process.env.DAUViet_MOBILE_ACCESSIBILITY_QA==="1"){
  const shell=readFileSync(resolve(process.cwd(),"src/ui/app-shell.tsx"),"utf8");
  const login=readFileSync(resolve(process.cwd(),"app/login.tsx"),"utf8");

  assert.match(shell,/accessibilityRole="link"/,"BOOK action must expose link semantics");
  assert.match(shell,/accessibilityRole="tablist"/,"Bottom navigation must expose tablist semantics");
  assert.match(shell,/accessibilityRole="tab"/,"Bottom navigation items must expose tab semantics");
  assert.match(shell,/accessibilityState=\{\{selected:/,"Active tab must expose selected state");
  assert.match(shell,/accessibilityLiveRegion="polite"/,"Async auth state must be announced");
  assert.match(shell,/minHeight:44/,"Interactive shell controls must retain >=44px touch targets");
  assert.match(login,/accessibilityLabel="Email"/,"Email input requires an accessible label");
  assert.match(login,/accessibilityLabel="Mật khẩu"/,"Password input requires an accessible label");
  assert.match(login,/accessibilityRole="alert"/,"Login errors must expose alert semantics");
  assert.match(login,/accessibilityState=\{\{disabled:busy\}\}/,"Busy login control must expose disabled state");
  console.log("Mobile accessibility regression passed");
}
