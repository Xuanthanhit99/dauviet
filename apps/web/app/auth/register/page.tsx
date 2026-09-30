"use client";

import {FormEvent,useState} from "react";
import {DauVietApiError} from "@dauviet/api-client";
import {webApi} from "../session";

export default function RegisterPage(){
 const [message,setMessage]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault(); setBusy(true); setError(""); setMessage("");
  const form=new FormData(event.currentTarget);
  try{
   await webApi.request("/auth/register",{method:"POST",body:JSON.stringify({email:String(form.get("email")??""),password:String(form.get("password")??""),displayName:String(form.get("displayName")??"")})});
   setMessage("Tài khoản đã được tạo. Hãy kiểm tra email để xác minh trước khi đăng nhập."); event.currentTarget.reset();
  }catch(value){setError(value instanceof DauVietApiError?value.message:"Không thể đăng ký lúc này.");}
  finally{setBusy(false);}
 }
 return <main id="main" className="auth-shell"><section className="auth-card" aria-labelledby="register-title">
  <div className="eyebrow">Bắt đầu hành trình</div><h1 id="register-title">Tạo tài khoản</h1>
  <form onSubmit={submit} className="auth-form">
   <label>Tên hiển thị<input name="displayName" autoComplete="name" required/></label>
   <label>Email<input name="email" type="email" autoComplete="email" required/></label>
   <label>Mật khẩu<input name="password" type="password" autoComplete="new-password" minLength={8} required/></label>
   {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
   <button className="button button-gold" disabled={busy} type="submit">{busy?"Đang tạo…":"Tạo tài khoản"}</button>
  </form><p><a href="/auth/login">Đã có tài khoản? Đăng nhập</a></p>
 </section></main>
}
