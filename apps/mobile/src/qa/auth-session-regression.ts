import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import assert from "node:assert/strict";

if(process.env.DAUViet_MOBILE_AUTH_QA==="1"){
  const session=readFileSync(resolve(process.cwd(),"src/auth/session.ts"),"utf8");
  const context=readFileSync(resolve(process.cwd(),"src/auth/auth-context.tsx"),"utf8");
  const login=readFileSync(resolve(process.cwd(),"app/login.tsx"),"utf8");

  assert.match(session,/expo-secure-store/,"Refresh credentials must use native secure storage");
  assert.match(session,/keychainAccessible:SecureStore\.AFTER_FIRST_UNLOCK/,"Refresh credentials must use the locked keychain accessibility policy");
  assert.match(session,/if\(!refreshToken\)return null/,"Restore must fail closed when no refresh credential exists");
  assert.match(session,/catch\{\s*accessToken=undefined;\s*await writeRefresh\(undefined\);\s*return null/,"Failed refresh must clear both access and refresh credentials");
  assert.match(session,/finally\{accessToken=undefined;await writeRefresh\(undefined\)\}/,"Logout must clear local credentials even if the server call fails");
  assert.match(context,/status:"loading"\|"authenticated"\|"anonymous"/,"Auth context must model explicit loading/authenticated/anonymous states");
  assert.match(context,/setStatus\(next\?"authenticated":"anonymous"\)/,"Restore result must drive authenticated versus anonymous state");
  assert.match(context,/setUser\(null\);setStatus\("anonymous"\)/,"Sign-out must immediately move the UI to anonymous state");
  assert.match(login,/await login\(email\.trim\(\),password\)/,"Login must use the canonical session helper");
  console.log("Mobile auth/session regression passed");
}
