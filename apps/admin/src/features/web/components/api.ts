export async function webRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/web/${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "The request could not be completed.");
  return body as T;
}
