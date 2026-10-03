"use client";

import {useEffect,useState} from "react";
import type {AuthUser} from "@dauviet/api-client";
import {restoreWebSession,webApi} from "../auth/session";
import {ConsumerShell} from "../components/consumer-shell";

export default function AccountPage(){
 const [user,setUser]=useState<AuthUser|null|undefined>(undefined);
 useEffect(()=>{void restoreWebSession().then(setUser)},[]);
 if(user===undefined)return <ConsumerShell><main id="main" className="auth-shell"><p role="status">Đang khôi phục phiên…</p></main></ConsumerShell>;
 if(!user)return <ConsumerShell><main id="main" className="auth-shell"><section className="auth-card"><h1>Phiên đăng nhập đã hết</h1><p>Bạn vẫn có thể khám phá nội dung công khai. Đăng nhập lại để tiếp tục hành trình cá nhân và mục đã lưu.</p><a className="button button-gold" href="/auth/login">Đăng nhập</a><a className="button" href="/explore">Tiếp tục khám phá</a></section></main></ConsumerShell>;
 return <ConsumerShell><main id="main" className="auth-shell"><section className="auth-card"><div className="eyebrow">Tài khoản</div><h1>{user.displayName||user.email||"Dấu Việt"}</h1><p>{user.email}</p><p>Ngôn ngữ: {user.locale||"vi"}</p><button className="button button-quiet" onClick={async()=>{await webApi.logout();window.location.assign("/")}}>Đăng xuất</button></section></main></ConsumerShell>
}
