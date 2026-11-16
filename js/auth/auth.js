/**
 * Auth client for Google Apps Script backend.
 * Token kept in sessionStorage only (not localStorage).
 */
import { API_BASE } from "../core/constants.js";

const TOKEN_KEY = "tf_session_token";
const USER_KEY = "tf_session_user";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

export function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  return !!getToken() && !!getUser();
}

export function isAdmin() {
  const u = getUser();
  return u && u.role === "admin";
}

function setSession(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

async function api(action, body = {}) {
  if (!API_BASE) throw new Error("آدرس Backend تنظیم نشده است (API_BASE).");
  const token = getToken();
  const payload = { action, ...body };
  if (token) payload.token = token;

  const url = API_BASE + (API_BASE.includes("?") ? "&" : "?") + "action=" + encodeURIComponent(action);
  // Prefer POST with JSON for privacy of password
  const r = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoid preflight issues with simple content-type
    body: JSON.stringify(payload),
    redirect: "follow"
  });
  if (!r.ok) throw new Error("خطای شبکه: " + r.status);
  const data = await r.json();
  if (!data.ok) {
    if (data.code === "UNAUTHORIZED") clearSession();
    throw Object.assign(new Error(data.error || "خطا"), { code: data.code });
  }
  return data;
}

export async function login(username, password) {
  const data = await api("login", { username, password });
  setSession(data.token, { username: data.username, role: data.role });
  return data;
}

export async function logout() {
  try {
    await api("logout");
  } catch (_) {}
  clearSession();
}

export async function me() {
  return api("me");
}

export async function listUsers() {
  return api("listusers");
}

export async function createUser(username, password, role = "user") {
  return api("createuser", { username, password, role });
}

export async function changePassword(username, password) {
  return api("changepassword", { username, password });
}

export async function deleteUser(username) {
  return api("deleteuser", { username });
}

/** Fetch xlsx as ArrayBuffer from backend */
export async function fetchSecureFile(name) {
  const data = await api("getfile", { name });
  const binary = atob(data.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function fetchSecureManifest() {
  return api("getmanifest");
}
