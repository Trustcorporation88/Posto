let csrfToken: string | null = null;
export function setBusinessCsrfToken(token: string | null) {
  csrfToken = token;
}
export function getBusinessCsrfToken() {
  return csrfToken;
}
