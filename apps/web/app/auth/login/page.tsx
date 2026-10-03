"use client";

import {FormEvent,useState} from "react";
import {DauVietApiError} from "@dauviet/api-client";
import {webApi} from "../session";
import {ConsumerShell} from "../../components/consumer-shell";

export default function LoginPage(){
 const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault(); setBusy(true); setError("");
  const form=new FormData(event.currentTarget);
  try{
   await webApi.login(String(form.get("email")??""),String(form.get("password")??""));
   window.location.assign("/account");
  }catch(value){
   setError(value instanceof DauVietApiError ? value.message : "Không thể đăng nhập lúc này.");
   setBusy(false);
  }
 }
 return <ConsumerShell><main id="main" className="auth-shell"><section className="auth-card" aria-labelledby="login-title">
  <div className="eyebrow">Tài khoản Dấu Việt</div><h1 id="login-title">Đăng nhập</h1>
  <p>Tiếp tục hành trình, cộng tác chuyến đi và lưu những nơi bạn quan tâm.</p>
  <form onSubmit={submit} className="auth-form">
   <label>Email<input name="email" type="email" autoComplete="email" required/></label>
   <label>Mật khẩu<input name="password" type="password" autoComplete="current-password" required minLength={8}/></label>
   {error&&<p role="alert">{error}</p>}
   <button className="button button-gold" disabled={busy} type="submit">{busy?"Đang đăng nhập…":"Đăng nhập"}</button>
  </form>
  <p><a href="/auth/register">Chưa có tài khoản? Đăng ký</a></p>
 </section></main></ConsumerShell>
}
