import type { CatalogResponse, GenerateRequest, GenerateResult } from "./types";

const DEFAULT_API_BASE_URL = "http://localhost:8000";

const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

/** Trailing slashes removed so paths compose predictably. */
export const apiBaseUrl = (configuredBase || DEFAULT_API_BASE_URL).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ValidationItem = { msg?: string; loc?: (string | number)[] };

function parseDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) return detail.trim();

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item: ValidationItem) => {
        if (!item?.msg) return null;
        const field = item.loc?.filter((part) => part !== "body").join(".");
        return field ? `${field}: ${item.msg}` : item.msg;
      })
      .filter((message): message is string => Boolean(message));

    return messages.length > 0 ? messages.join(" · ") : null;
  }

  return null;
}

async function toApiError(response: Response): Promise<ApiError> {
  let message = `The routine service answered ${response.status}.`;

  try {
    const body = (await response.json()) as { detail?: unknown };
    const detail = parseDetail(body?.detail);
    if (detail) message = detail;
  } catch {
    // Non-JSON error body: keep the status-based message.
  }

  return new ApiError(message, response.status);
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(
      `The routine service at ${apiBaseUrl} did not answer. Check that the API is running.`,
      0,
    );
  }

  if (!response.ok) throw await toApiError(response);

  return (await response.json()) as T;
}

export function getCatalog(signal?: AbortSignal): Promise<CatalogResponse> {
  return send<CatalogResponse>("/api/catalog", {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
}

export function generateRoutines(
  request: GenerateRequest,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  return send<GenerateResult>("/api/generate", {
    method: "POST",
    signal,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
}
