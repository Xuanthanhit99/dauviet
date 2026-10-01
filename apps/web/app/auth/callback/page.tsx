"use client";

import {useEffect,useState} from "react";
import {restoreWebSession} from "../session";

export default function AuthCallback(){
 const [failed,setFailed]=useState(false);
 useEffect(()=>{void restoreWebSession().then(user=>{if(user)window.location.replace("/account");else setFailed(true)})},[]);
 return <main id="main" className="auth-shell"><section className="auth-card"><h1>{failed?"Không thể hoàn tất đăng nhập":"Đang hoàn tất đăng nhập…"}</h1>{failed&&<a href="/auth/login">Quay lại đăng nhập</a>}</section></main>
}
