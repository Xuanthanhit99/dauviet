import {DauVietApiClient,type AuthSession,type AuthUser} from "@dauviet/api-client";
let accessToken:string|undefined; let refreshToken:string|undefined;
export const mobileApi=new DauVietApiClient({baseUrl:process.env.EXPO_PUBLIC_API_URL??"http://127.0.0.1:3000",platform:"android",getAccessToken:()=>accessToken,onAccessToken:t=>{accessToken=t}});
export async function login(email:string,password:string){const s=await mobileApi.login(email,password);refreshToken=s.refreshToken;return s}
export async function restore():Promise<AuthUser|null>{if(!refreshToken)return null;try{const s:AuthSession=await mobileApi.refresh(refreshToken);refreshToken=s.refreshToken??refreshToken;return await mobileApi.me()}catch{accessToken=undefined;refreshToken=undefined;return null}}
export async function logout(){try{await mobileApi.logout(refreshToken)}finally{accessToken=undefined;refreshToken=undefined}}
export function setNativeRefreshToken(value:string|undefined){refreshToken=value}
