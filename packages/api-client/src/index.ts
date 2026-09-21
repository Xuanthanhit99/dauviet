export type ApiClientPlatform = "web" | "ios" | "android";

export type ApiClientOptions = {
  baseUrl: string;
  platform: ApiClientPlatform;
  getAccessToken?: () => string | undefined | Promise<string | undefined>;
};

export type ApiRequestOptions = RequestInit & {
  query?: Record<string, string | number | boolean | undefined>;
};

export class DauVietApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(path: string, init: ApiRequestOptions = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("X-Client-Platform", this.options.platform);
    const token = await this.options.getAccessToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const url = new URL(`${this.options.baseUrl.replace(/\/$/, "")}/v1${path.startsWith("/") ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      ...init,
      headers,
      credentials: this.options.platform === "web" ? "include" : init.credentials,
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = new Error(payload?.error?.message ?? `Dấu Việt API request failed (${response.status})`);
      Object.assign(error, { status: response.status, code: payload?.error?.code, payload });
      throw error;
    }
    return (payload?.data ?? payload) as T;
  }
}
