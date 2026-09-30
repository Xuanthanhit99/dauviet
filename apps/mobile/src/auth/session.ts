import {Platform} from "react-native";
import * as SecureStore from "expo-secure-store";
import {DauVietApiClient,type AuthSession,type AuthUser} from "@dauviet/api-client";

const REFRESH_KEY="dv_refresh_token";
let accessToken:string|undefined;

export const mobileApi=new DauVietApiClient({
  baseUrl:process.env.EXPO_PUBLIC_API_URL??"http://127.0.0.1:3000",
  platform:Platform.OS==="ios"?"ios":"android",
  getAccessToken:()=>accessToken,
  onAccessToken:t=>{accessToken=t},
});

async function readRefresh(){return SecureStore.getItemAsync(REFRESH_KEY)}
async function writeRefresh(value:string|undefined){if(value)await SecureStore.setItemAsync(REFRESH_KEY,value,{keychainAccessible:SecureStore.AFTER_FIRST_UNLOCK});else await SecureStore.deleteItemAsync(REFRESH_KEY)}

export async function login(email:string,password:string){
 const session=await mobileApi.login(email,password);
 await writeRefresh(session.refreshToken);
 return session;
}

export async function restore():Promise<AuthUser|null>{
 const refreshToken=await readRefresh();
 if(!refreshToken)return null;
 try{
  const session:AuthSession=await mobileApi.refresh(refreshToken);
  await writeRefresh(session.refreshToken??refreshToken);
  return await mobileApi.me();
 }catch{
  accessToken=undefined;
  await writeRefresh(undefined);
  return null;
 }
}

export async function logout(){
 const refreshToken=await readRefresh();
 try{await mobileApi.logout(refreshToken ?? undefined)}finally{accessToken=undefined;await writeRefresh(undefined)}
}
