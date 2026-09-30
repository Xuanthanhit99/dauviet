"use client";

import {DauVietApiClient} from "@dauviet/api-client";

let accessToken: string | undefined;

function readCsrfCookie() {
  if (typeof document === "undefined") return undefined;
  return document.cookie.split("; ").find((value) => value.startsWith("dv_csrf="))?.split("=").slice(1).join("=");
}

export const webApi = new DauVietApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000",
  platform: "web",
  getAccessToken: () => accessToken,
  onAccessToken: (token) => { accessToken = token; },
  getCsrfToken: readCsrfCookie,
});

export async function restoreWebSession() {
  try {
    await webApi.refresh();
    return await webApi.me();
  } catch {
    accessToken = undefined;
    return null;
  }
}
