import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import assert from "node:assert/strict";

if(process.env.DAUViet_MOBILE_FAILURE_QA==="1"){
  const stay=readFileSync(resolve(process.cwd(),"app/book/stay/[slug].tsx"),"utf8");
  const together=readFileSync(resolve(process.cwd(),"app/trips/[id]/together.tsx"),"utf8");
  const detail=readFileSync(resolve(process.cwd(),"src/discovery/detail-screen.tsx"),"utf8");
  const community=readFileSync(resolve(process.cwd(),"app/community/[slug].tsx"),"utf8");

  assert.match(stay,/setOffers\(\[\]\);setMessage\("Không thể lấy dữ liệu nhà cung cấp\. Không có giá hay khả dụng dựng giả\."\)/,"Provider failure must clear offers and never invent price/availability");
  assert.match(stay,/setMessage\("Nhà cung cấp hiện không đủ điều kiện chuyển tiếp\. Không dựng liên kết thay thế\."\)/,"Affiliate handoff failure must fail closed");
  assert.match(detail,/Dữ liệu không được thay thế bằng nội dung giả\./,"Discovery failure must not synthesize replacement content");
  assert.match(detail,/onRetry=\{run\}/,"Discovery detail failure must expose retry");
  assert.match(together,/requestForegroundPermissionsAsync\(\)/,"Location must request foreground permission explicitly");
  assert.match(together,/Bạn đã không cấp quyền vị trí\. Không có tọa độ nào được gửi\./,"Denied location permission must send no coordinates");
  assert.match(together,/Thiết bị không thể xác định vị trí\. Không có tọa độ nào được gửi\./,"Location acquisition failure must send no coordinates");
  assert.match(together,/TRIP_VERSION_CONFLICT/,"Trip mutation conflicts must be handled explicitly");
  assert.match(together,/await load\(\)/,"Trip mutation failure/conflict must reload authoritative state");
  assert.match(community,/Không thể ghi nhận bình chọn\./,"Community mutation failure must remain explicit");
  console.log("Mobile failure/offline/fail-closed regression passed");
}
