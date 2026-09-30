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

  listAccommodations<T = unknown>(query: { country?: string; region?: string; city?: string; destination?: string; type?: string; page?: number; pageSize?: number } = {}) { return this.request<T>("/accommodations", { query }); }
  accommodation<T = unknown>(slug: string) { return this.request<T>(`/accommodations/${encodeURIComponent(slug)}`); }
  accommodationOffers<T = unknown>(slug: string, query: { checkIn: string; checkOut: string; guests: number; rooms?: number; currency: string }) { return this.request<T>(`/accommodations/${encodeURIComponent(slug)}/offers`, { query }); }
  listRestaurants<T = unknown>(query: { country?: string; region?: string; city?: string; cuisine?: string; page?: number; pageSize?: number } = {}) { return this.request<T>("/restaurants", { query }); }
  restaurant<T = unknown>(slug: string) { return this.request<T>(`/restaurants/${encodeURIComponent(slug)}`); }
  restaurantOperationalSnapshot<T = unknown>(slug: string) { return this.request<T>(`/restaurants/${encodeURIComponent(slug)}/operational-snapshot`); }
  listActivities<T = unknown>(query: { country?: string; destination?: string; page?: number; pageSize?: number } = {}) { return this.request<T>("/activities", { query }); }
  activity<T = unknown>(slug: string) { return this.request<T>(`/activities/${encodeURIComponent(slug)}`); }
  activityOffers<T = unknown>(slug: string, query: { date: string; participants: number; currency: string }) { return this.request<T>(`/activities/${encodeURIComponent(slug)}/offers`, { query }); }
  createAffiliateClick<T = unknown>(input: { providerCode: string; providerEntityReferenceId?: string; providerOfferId?: string; entityKind?: string; surface: string; placement?: string; tripId?: string; destinationId?: string; sessionId?: string }) { return this.request<T>("/affiliate/clicks", { method: "POST", body: JSON.stringify(input) }); }
  affiliateRedirectUrl(token: string) { return `${this.options.baseUrl.replace(/\/$/, "")}/v1/affiliate/r/${encodeURIComponent(token)}`; }


  listBookmarks<T = unknown>(targetType?: string) { return this.request<T>("/bookmarks", { query: { targetType } }); }
  addBookmark<T = unknown>(targetType: string, targetId: string) { return this.request<T>("/bookmarks", { method: "POST", body: JSON.stringify({ targetType, targetId }) }); }
  removeBookmark<T = unknown>(targetType: string, targetId: string) { return this.request<T>("/bookmarks", { method: "DELETE", body: JSON.stringify({ targetType, targetId }) }); }

  listCommunityStories<T = unknown>(query: { type?: string; placeId?: string; sort?: "NEW" | "HELPFUL"; cursor?: string; limit?: number } = {}) { return this.request<T>("/community/stories", { query }); }
  communityStory<T = unknown>(slug: string) { return this.request<T>(`/community/stories/${encodeURIComponent(slug)}`); }
  communityStoryComments<T = unknown>(slug: string, cursor?: string, limit?: number) { return this.request<T>(`/community/stories/${encodeURIComponent(slug)}/comments`, { query: { cursor, limit } }); }
  myCommunityStories<T = unknown>() { return this.request<T>("/community/stories/mine"); }
  createCommunityStory<T = unknown>(input: unknown) { return this.request<T>("/community/stories", { method: "POST", body: JSON.stringify(input) }); }
  updateCommunityStory<T = unknown>(id: string, input: unknown) { return this.request<T>(`/community/stories/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }); }
  withdrawCommunityStory<T = unknown>(id: string) { return this.request<T>(`/community/stories/${encodeURIComponent(id)}`, { method: "DELETE" }); }
  voteCommunityStory<T = unknown>(id: string) { return this.request<T>(`/community/stories/${encodeURIComponent(id)}/vote`, { method: "POST" }); }
  unvoteCommunityStory<T = unknown>(id: string) { return this.request<T>(`/community/stories/${encodeURIComponent(id)}/vote`, { method: "DELETE" }); }

  myContributions<T = unknown>() { return this.request<T>("/contributions/mine"); }
  contribution<T = unknown>(id: string) { return this.request<T>(`/contributions/mine/${encodeURIComponent(id)}`); }
  createContribution<T = unknown>(input: unknown) { return this.request<T>("/contributions", { method: "POST", body: JSON.stringify(input) }); }
  updateContribution<T = unknown>(id: string, input: unknown) { return this.request<T>(`/contributions/mine/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }); }
  withdrawContribution<T = unknown>(id: string, reason?: string) { return this.request<T>(`/contributions/mine/${encodeURIComponent(id)}/withdraw`, { method: "POST", body: JSON.stringify({ reason }) }); }
  addContributionProvenance<T = unknown>(id: string, input: unknown) { return this.request<T>(`/contributions/${encodeURIComponent(id)}/provenance-sources`, { method: "POST", body: JSON.stringify(input) }); }


  adminContributions<T = unknown>(query: { status?: string; type?: string; cursor?: string; limit?: number } = {}) { return this.request<T>("/admin/contributions", { query }); }
  adminContribution<T = unknown>(id: string) { return this.request<T>(`/admin/contributions/${encodeURIComponent(id)}`); }
  adminReviewContribution<T = unknown>(id: string, input: unknown) { return this.request<T>(`/admin/contributions/${encodeURIComponent(id)}/reviews`, { method: "POST", body: JSON.stringify(input) }); }
  adminSetContributionRights<T = unknown>(id: string, input: unknown) { return this.request<T>(`/admin/contributions/${encodeURIComponent(id)}/rights-review`, { method: "PATCH", body: JSON.stringify(input) }); }
  adminSetContributionProvenanceConfidence<T = unknown>(id: string, input: unknown) { return this.request<T>(`/admin/contributions/${encodeURIComponent(id)}/provenance-confidence`, { method: "PATCH", body: JSON.stringify(input) }); }
  adminSetContributionSensitivity<T = unknown>(id: string, input: unknown) { return this.request<T>(`/admin/contributions/${encodeURIComponent(id)}/sensitivity`, { method: "PATCH", body: JSON.stringify(input) }); }
  adminCatalogueContributionSource<T = unknown>(id: string, input: unknown) { return this.request<T>(`/admin/contributions/${encodeURIComponent(id)}/catalogue/source`, { method: "POST", body: JSON.stringify(input) }); }
  adminCatalogueContributionDocument<T = unknown>(id: string, input: unknown) { return this.request<T>(`/admin/contributions/${encodeURIComponent(id)}/catalogue/document`, { method: "POST", body: JSON.stringify(input) }); }
  adminCatalogueContributionMedia<T = unknown>(id: string, input: unknown) { return this.request<T>(`/admin/contributions/${encodeURIComponent(id)}/catalogue/media`, { method: "POST", body: JSON.stringify(input) }); }
  adminStoryPreview<T = unknown>(id: string) { return this.request<T>(`/admin/stories/${encodeURIComponent(id)}/preview`); }
  adminStoryMedia<T = unknown>(id: string) { return this.request<T>(`/admin/stories/${encodeURIComponent(id)}/media`); }
  adminIngestionSources<T = unknown>() { return this.request<T>("/admin/ingestion/sources"); }
  adminIngestionSource<T = unknown>(id: string) { return this.request<T>(`/admin/ingestion/sources/${encodeURIComponent(id)}`); }
  adminSetIngestionSourceEnabled<T = unknown>(id: string, enabled: boolean) { return this.request<T>(`/admin/ingestion/sources/${encodeURIComponent(id)}/enabled`, { method: "PATCH", body: JSON.stringify({ enabled }) }); }
  adminIngestionJobs<T = unknown>() { return this.request<T>("/admin/ingestion/jobs"); }
  adminRunIngestionJob<T = unknown>(id: string) { return this.request<T>(`/admin/ingestion/jobs/${encodeURIComponent(id)}/run`, { method: "POST" }); }
  adminCancelIngestionRun<T = unknown>(id: string) { return this.request<T>(`/admin/ingestion/runs/${encodeURIComponent(id)}/cancel`, { method: "POST" }); }
  adminSources<T = unknown>(query: { sourceType?: string; q?: string } = {}) { return this.request<T>("/sources", { query }); }
  adminSource<T = unknown>(id: string) { return this.request<T>(`/sources/${encodeURIComponent(id)}`); }
  adminArchiveSource<T = unknown>(id: string, reason?: string) { return this.request<T>(`/sources/${encodeURIComponent(id)}/archive`, { method: "PATCH", body: JSON.stringify({ reason }) }); }
  adminVerifyCitation<T = unknown>(id: string) { return this.request<T>(`/citations/${encodeURIComponent(id)}/verify`, { method: "PATCH" }); }
  adminDisputeCitation<T = unknown>(id: string) { return this.request<T>(`/citations/${encodeURIComponent(id)}/dispute`, { method: "PATCH" }); }
  adminRejectCitation<T = unknown>(id: string, reason?: string) { return this.request<T>(`/citations/${encodeURIComponent(id)}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) }); }
  adminUpdateMediaRights<T = unknown>(id: string, input: unknown) { return this.request<T>(`/media/${encodeURIComponent(id)}/rights`, { method: "PATCH", body: JSON.stringify(input) }); }
  adminMedia<T = unknown>(id: string) { return this.request<T>(`/media/${encodeURIComponent(id)}`); }
  adminSetMediaTranslation<T = unknown>(id: string, locale: string, input: unknown) { return this.request<T>(`/media/${encodeURIComponent(id)}/translations/${encodeURIComponent(locale)}`, { method: "PATCH", body: JSON.stringify(input) }); }
  adminSetMediaAccessPolicy<T = unknown>(id: string, accessPolicy: string) { return this.request<T>(`/media/${encodeURIComponent(id)}/access-policy`, { method: "PATCH", body: JSON.stringify({ accessPolicy }) }); }
  adminArchiveMedia<T = unknown>(id: string, reason?: string) { return this.request<T>(`/media/${encodeURIComponent(id)}/archive`, { method: "PATCH", body: JSON.stringify({ reason }) }); }
  adminCleanupExpiredUploads<T = unknown>() { return this.request<T>("/media/admin/cleanup-expired-uploads", { method: "POST" }); }
  adminQuarantineMedia<T = unknown>(id: string, input: unknown) { return this.request<T>(`/media/${encodeURIComponent(id)}/quarantine`, { method: "PATCH", body: JSON.stringify(input) }); }
  adminModerationQueue<T = unknown>(query: { status?: string; targetType?: string; category?: string; from?: string; to?: string } = {}) { return this.request<T>("/admin/moderation/queue", { query }); }
  adminModerationAction<T = unknown>(input: unknown) { return this.request<T>("/admin/moderation/actions", { method: "POST", body: JSON.stringify(input) }); }
  adminAudit<T = unknown>(entityType?: string, entityId?: string) { return this.request<T>("/admin/audit", { query: { entityType, entityId } }); }
  adminProviders<T = unknown>(page = 1, pageSize = 20, status?: string) { return this.request<T>("/admin/providers", { query: { page, pageSize, status } }); }
  adminProvider<T = unknown>(id: string) { return this.request<T>(`/admin/providers/${encodeURIComponent(id)}`); }
  adminSetProviderStatus<T = unknown>(id: string, status: string) { return this.request<T>(`/admin/providers/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); }
  adminAffiliateConversions<T = unknown>() { return this.request<T>("/admin/affiliate/conversions"); }
  adminAffiliateSummary<T = unknown>() { return this.request<T>("/admin/affiliate/summary"); }

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
