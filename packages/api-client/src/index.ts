export type ApiClientPlatform = "web" | "ios" | "android";

export type ApiClientOptions = {
  baseUrl: string;
  platform: ApiClientPlatform;
  getAccessToken?: () => string | undefined | Promise<string | undefined>;
  onAccessToken?: (token: string | undefined) => void | Promise<void>;
  getCsrfToken?: () => string | undefined | Promise<string | undefined>;
};

export type ApiRequestOptions = RequestInit & {
  query?: Record<string, string | number | boolean | undefined>;
};

export type ApiErrorPayload = {
  success: false;
  error: { code: string; message: string; details?: unknown };
  path?: string;
  timestamp?: string;
  requestId?: string;
};

export class DauVietApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly payload?: ApiErrorPayload,
  ) {
    super(message);
    this.name = "DauVietApiError";
  }
}

export type AuthUser = {
  id: string;
  email?: string;
  displayName?: string | null;
  locale?: string;
  roles?: string[];
  [key: string]: unknown;
};

export type AuthSession = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user?: AuthUser;
};

export class DauVietApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(path: string, init: ApiRequestOptions = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("X-Client-Platform", this.options.platform);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
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
      const apiError = payload as ApiErrorPayload | undefined;
      throw new DauVietApiError(
        apiError?.error?.message ?? `Dấu Việt API request failed (${response.status})`,
        response.status,
        apiError?.error?.code ?? "UNKNOWN_API_ERROR",
        apiError,
      );
    }
    return (payload?.data ?? payload) as T;
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const session = await this.request<AuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await this.options.onAccessToken?.(session.accessToken);
    return session;
  }

  async refresh(refreshToken?: string): Promise<AuthSession> {
    const headers = new Headers();
    if (this.options.platform === "web") {
      const csrf = await this.options.getCsrfToken?.();
      if (csrf) headers.set("X-CSRF-Token", csrf);
    }
    const session = await this.request<AuthSession>("/auth/refresh", {
      method: "POST",
      headers,
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    });
    await this.options.onAccessToken?.(session.accessToken);
    return session;
  }

  async logout(refreshToken?: string): Promise<void> {
    const headers = new Headers();
    if (this.options.platform === "web") {
      const csrf = await this.options.getCsrfToken?.();
      if (csrf) headers.set("X-CSRF-Token", csrf);
    }
    await this.request<{ loggedOut: true }>("/auth/logout", {
      method: "POST",
      headers,
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    });
    await this.options.onAccessToken?.(undefined);
  }

  register(input: { email: string; password: string; displayName: string }) {
    return this.request<{ id?: string; email?: string }>("/auth/register", { method: "POST", body: JSON.stringify(input) });
  }

  verifyEmail(token: string) {
    return this.request("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
  }

  resendVerification(email: string) {
    return this.request("/auth/email-verification/resend", { method: "POST", body: JSON.stringify({ email }) });
  }

  requestPasswordReset(email: string) {
    return this.request("/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email }) });
  }

  resetPassword(token: string, newPassword: string) {
    return this.request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) });
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.request("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
  }

  listSessions<T = unknown[]>() { return this.request<T>("/auth/sessions"); }
  revokeSession(id: string) { return this.request(`/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }); }
  revokeAllSessions() { return this.request("/auth/sessions/revoke-all", { method: "POST" }); }

  me(): Promise<AuthUser> { return this.request<AuthUser>("/users/me"); }
  updateProfile(input: { displayName?: string; locale?: string; visitedPlacesPublic?: boolean }) {
    return this.request<AuthUser>("/users/me", { method: "PATCH", body: JSON.stringify(input) });
  }

  listTrips<T = unknown>(query: { page?: number; pageSize?: number; status?: string } = {}) {
    return this.request<T>("/trips", { query });
  }

  createTrip<T = unknown>(input: {
    title: string; startDate: string; endDate: string; primaryCurrency: string;
    travelerCount?: number; roomCount?: number; originCountrySlug?: string;
    originRegionSlug?: string; originCitySlug?: string; originLabel?: string;
    targetBudgetAmount?: string; targetBudgetCurrency?: string; notes?: string;
  }) {
    return this.request<T>("/trips", { method: "POST", body: JSON.stringify(input) });
  }

  trip<T = unknown>(id: string) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}`);
  }

  updateTrip<T = unknown>(id: string, input: Record<string, unknown>) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
  }

  replaceTripDestinations<T = unknown>(id: string, expectedVersion: number, destinations: unknown[]) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/destinations`, { method: "PUT", body: JSON.stringify({ expectedVersion, destinations }) });
  }

  replaceTripDayItems<T = unknown>(id: string, dayId: string, expectedVersion: number, items: unknown[]) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/days/${encodeURIComponent(dayId)}/items`, { method: "PUT", body: JSON.stringify({ expectedVersion, items }) });
  }

  replaceTripTransportLegs<T = unknown>(id: string, expectedVersion: number, transportLegs: unknown[]) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/transport-legs`, { method: "PUT", body: JSON.stringify({ expectedVersion, transportLegs }) });
  }

  generateTripEstimate<T = unknown>(id: string) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/estimates`, { method: "POST" });
  }

  latestTripEstimate<T = unknown>(id: string) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/estimates/latest`);
  }

  tripMembers<T = unknown>(id: string) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/members`);
  }

  inviteTripMember<T = unknown>(id: string, email: string, role: "EDITOR" | "VIEWER") {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/invitations`, { method: "POST", body: JSON.stringify({ email, role }) });
  }

  tripInvitations<T = unknown>(id: string) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/invitations`);
  }

  updateTripMemberRole<T = unknown>(id: string, memberId: string, role: "EDITOR" | "VIEWER", expectedVersion: number) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`, { method: "PATCH", body: JSON.stringify({ role, expectedVersion }) });
  }

  removeTripMember<T = unknown>(id: string, memberId: string, expectedVersion: number) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`, { method: "DELETE", body: JSON.stringify({ expectedVersion }) });
  }

  tripActivity<T = unknown>(id: string, page = 1, pageSize = 20) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/activity`, { query: { page, pageSize } });
  }

  acceptTripInvitation<T = unknown>(token: string) { return this.request<T>("/trip-invitations/accept", { method: "POST", body: JSON.stringify({ token }) }); }
  declineTripInvitation<T = unknown>(token: string) { return this.request<T>("/trip-invitations/decline", { method: "POST", body: JSON.stringify({ token }) }); }

  revokeTripInvitation<T = unknown>(id: string, invitationId: string) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invitationId)}`, { method: "DELETE" });
  }

  leaveTrip<T = unknown>(id: string, expectedVersion: number) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/leave`, { method: "POST", body: JSON.stringify({ expectedVersion }) });
  }

  transferTripOwnership<T = unknown>(id: string, newOwnerUserId: string, expectedVersion: number) {
    return this.request<T>(`/trips/${encodeURIComponent(id)}/transfer-ownership`, { method: "POST", body: JSON.stringify({ newOwnerUserId, expectedVersion }) });
  }

  myTripLocationSharing<T = unknown>(id: string) { return this.request<T>(`/trips/${encodeURIComponent(id)}/location-sharing/me`); }
  startTripLocationSharing<T = unknown>(id: string, durationMinutes: number) { return this.request<T>(`/trips/${encodeURIComponent(id)}/location-sharing/start`, { method: "POST", body: JSON.stringify({ durationMinutes }) }); }
  stopTripLocationSharing<T = unknown>(id: string) { return this.request<T>(`/trips/${encodeURIComponent(id)}/location-sharing/stop`, { method: "POST" }); }
  tripLocations<T = unknown>(id: string) { return this.request<T>(`/trips/${encodeURIComponent(id)}/locations`); }
  updateTripLocation<T = unknown>(id: string, input: { latitude: number; longitude: number; accuracyMeters: number; capturedAt: string }) { return this.request<T>(`/trips/${encodeURIComponent(id)}/location`, { method: "PUT", body: JSON.stringify(input) }); }

  tripExpenses<T = unknown>(id: string, page = 1, pageSize = 20) { return this.request<T>(`/trips/${encodeURIComponent(id)}/expenses`, { query: { page, pageSize } }); }
  createTripExpense<T = unknown>(id: string, input: unknown) { return this.request<T>(`/trips/${encodeURIComponent(id)}/expenses`, { method: "POST", body: JSON.stringify(input) }); }
  updateTripExpense<T = unknown>(id: string, expenseId: string, input: unknown) { return this.request<T>(`/trips/${encodeURIComponent(id)}/expenses/${encodeURIComponent(expenseId)}`, { method: "PATCH", body: JSON.stringify(input) }); }
  deleteTripExpense<T = unknown>(id: string, expenseId: string, expectedVersion: number) { return this.request<T>(`/trips/${encodeURIComponent(id)}/expenses/${encodeURIComponent(expenseId)}`, { method: "DELETE", body: JSON.stringify({ expectedVersion }) }); }
  tripExpenseSummary<T = unknown>(id: string) { return this.request<T>(`/trips/${encodeURIComponent(id)}/expenses/summary`); }
  tripSettlementSuggestions<T = unknown>(id: string) { return this.request<T>(`/trips/${encodeURIComponent(id)}/settlement-suggestions`); }
  tripSettlements<T = unknown>(id: string, page = 1, pageSize = 20) { return this.request<T>(`/trips/${encodeURIComponent(id)}/settlements`, { query: { page, pageSize } }); }
  createTripSettlement<T = unknown>(id: string, input: unknown) { return this.request<T>(`/trips/${encodeURIComponent(id)}/settlements`, { method: "POST", body: JSON.stringify(input) }); }
}
