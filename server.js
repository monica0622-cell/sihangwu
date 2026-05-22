import http from "node:http";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brands as standardBrands, categories } from "./src/data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const uploadDir = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, "uploads");
const dbPath = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 4176);
const host = process.env.HOST || "0.0.0.0";
const adminPassword = process.env.ADMIN_PASSWORD || "";
const uploadLimitBytes = Number(process.env.UPLOAD_LIMIT_MB || 12) * 1024 * 1024;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadDir, { recursive: true });
  try {
    return normalizeDb(JSON.parse(await fs.readFile(dbPath, "utf8")));
  } catch {
    const db = normalizeDb({});
    await writeDb(db);
    return db;
  }
}

function normalizeDb(db) {
  return {
    users: Array.isArray(db.users) ? db.users : [],
    sessions: Array.isArray(db.sessions) ? db.sessions : [],
    garments: Array.isArray(db.garments) ? db.garments : [],
    outfits: Array.isArray(db.outfits) ? db.outfits : [],
    customBrands: Array.isArray(db.customBrands) ? db.customBrands : []
  };
}

async function writeDb(db) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

async function readBody(request, limit = 12 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Payload too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function send(response, statusCode, payload, contentType = "application/json; charset=utf-8") {
  response.writeHead(statusCode, { "content-type": contentType });
  if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
    response.end(payload);
    return;
  }
  response.end(typeof payload === "string" ? payload : JSON.stringify(payload));
}

function isAdminAuthorized(request) {
  if (!adminPassword) return true;
  const header = request.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  try {
    const [username, password] = Buffer.from(encoded, "base64").toString("utf8").split(":");
    return username === "admin" && password === adminPassword;
  } catch {
    return false;
  }
}

function requireAdmin(request, response) {
  if (isAdminAuthorized(request)) return true;
  response.writeHead(401, {
    "content-type": "text/plain; charset=utf-8",
    "www-authenticate": 'Basic realm="Smart Wardrobe Admin"'
  });
  response.end("Authentication required");
  return false;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email || "",
    name: user.name || "",
    isRegistered: Boolean(user.email),
    deviceId: user.deviceId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash = "") {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = hashPassword(password, salt).split(":")[1];
  const candidateBuffer = Buffer.from(candidate, "hex");
  const hashBuffer = Buffer.from(hash, "hex");
  return candidateBuffer.length === hashBuffer.length && crypto.timingSafeEqual(candidateBuffer, hashBuffer);
}

function createSession(db, userId) {
  const now = new Date().toISOString();
  const session = {
    token: crypto.randomBytes(32).toString("base64url"),
    userId,
    createdAt: now,
    lastSeenAt: now
  };
  db.sessions = db.sessions.filter((item) => item.userId !== userId).slice(-4);
  db.sessions.push(session);
  return session.token;
}

function getBearerToken(request) {
  const header = request.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" ? token : "";
}

function getSessionUser(db, request) {
  const token = getBearerToken(request);
  if (!token) return null;
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) return null;
  session.lastSeenAt = new Date().toISOString();
  return user;
}

function getUserWardrobe(db, userId) {
  return {
    garments: db.garments.filter((item) => item.userId === userId).map(({ userId: _userId, ...item }) => item),
    outfits: db.outfits.filter((item) => item.userId === userId).map(({ userId: _userId, ...item }) => item),
    customBrands: db.customBrands.filter((item) => item.userId === userId).map(({ userId: _userId, ...item }) => item)
  };
}

function upsertUser(db, deviceId) {
  const now = new Date().toISOString();
  let user = db.users.find((item) => item.deviceId === deviceId);
  if (!user) {
    user = { id: crypto.randomUUID(), deviceId, createdAt: now, updatedAt: now };
    db.users.push(user);
  } else {
    user.updatedAt = now;
  }
  return user;
}

async function handleApi(request, response, url) {
  const db = await ensureDb();

  if (request.method === "GET" && url.pathname === "/api/health") {
    return send(response, 200, { ok: true, service: "smart-wardrobe", time: new Date().toISOString() });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readBody(request);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return send(response, 400, { error: "请输入有效邮箱" });
    if (password.length < 8) return send(response, 400, { error: "密码至少需要 8 位" });
    if (db.users.some((user) => normalizeEmail(user.email) === email)) return send(response, 409, { error: "这个邮箱已经注册" });
    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      email,
      name,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now
    };
    db.users.push(user);
    const token = createSession(db, user.id);
    await writeDb(db);
    return send(response, 201, { token, user: publicUser(user), standardBrands, categories, ...getUserWardrobe(db, user.id) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(request);
    const email = normalizeEmail(body.email);
    const user = db.users.find((item) => normalizeEmail(item.email) === email);
    if (!user || !verifyPassword(body.password, user.passwordHash)) return send(response, 401, { error: "邮箱或密码不正确" });
    user.updatedAt = new Date().toISOString();
    const token = createSession(db, user.id);
    await writeDb(db);
    return send(response, 200, { token, user: publicUser(user), standardBrands, categories, ...getUserWardrobe(db, user.id) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = getBearerToken(request);
    if (token) db.sessions = db.sessions.filter((session) => session.token !== token);
    await writeDb(db);
    return send(response, 200, { ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const authUser = getSessionUser(db, request);
    const deviceId = url.searchParams.get("deviceId") || crypto.randomUUID();
    const user = authUser || upsertUser(db, deviceId);
    await writeDb(db);
    return send(response, 200, { user: publicUser(user), standardBrands, categories, ...getUserWardrobe(db, user.id) });
  }

  if (request.method === "PUT" && url.pathname.match(/^\/api\/users\/[^/]+\/wardrobe$/)) {
    const userId = decodeURIComponent(url.pathname.split("/")[3]);
    if (!db.users.some((user) => user.id === userId)) return send(response, 404, { error: "User not found" });
    const authUser = getSessionUser(db, request);
    if (authUser && authUser.id !== userId) return send(response, 403, { error: "Forbidden" });
    const body = await readBody(request);
    const stamp = new Date().toISOString();
    db.garments = db.garments.filter((item) => item.userId !== userId).concat((body.garments || []).map((item) => ({ ...item, userId })));
    db.outfits = db.outfits.filter((item) => item.userId !== userId).concat((body.outfits || []).map((item) => ({ ...item, userId })));
    db.customBrands = db.customBrands
      .filter((item) => item.userId !== userId)
      .concat((body.customBrands || []).map((item) => ({ ...item, userId })));
    const user = db.users.find((item) => item.id === userId);
    user.updatedAt = stamp;
    await writeDb(db);
    return send(response, 200, { ok: true, savedAt: stamp });
  }

  if (request.method === "POST" && url.pathname === "/api/upload") {
    const body = await readBody(request, uploadLimitBytes);
    const match = String(body.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return send(response, 400, { error: "Invalid image data" });
    const extension = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
    const filename = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), Buffer.from(match[2], "base64"));
    return send(response, 201, { url: `/uploads/${filename}` });
  }

  if (request.method === "GET" && url.pathname === "/api/admin/stats") {
    const brandList = [...standardBrands, ...db.customBrands];
    const brandName = (id) => brandList.find((brand) => brand.id === id)?.nameEn || id || "Unknown";
    const categoryName = (id) => categories.find((category) => category.code === id)?.nameCn || id || "未分类";
    const countBy = (items, mapper) =>
      Object.entries(items.reduce((counts, item) => {
        const key = mapper(item);
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    return send(response, 200, {
      totals: {
        users: db.users.length,
        registeredUsers: db.users.filter((user) => user.email).length,
        garments: db.garments.length,
        outfits: db.outfits.length,
        customBrands: db.customBrands.length,
        uploads: await countUploads(),
        sessions: db.sessions.length
      },
      brandStats: countBy(db.garments, (item) => brandName(item.brandId)),
      categoryStats: countBy(db.garments, (item) => categoryName(item.categoryLevel1)),
      recentUsers: [...db.users].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12).map(publicUser)
    });
  }

  return send(response, 404, { error: "API not found" });
}

async function countUploads() {
  try {
    return (await fs.readdir(uploadDir)).length;
  } catch {
    return 0;
  }
}

function resolveInside(baseDir, pathname) {
  const filePath = path.resolve(baseDir, `.${decodeURIComponent(pathname)}`);
  const relative = path.relative(baseDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return filePath;
}

async function serveFile(response, baseDir, pathname) {
  const filePath = resolveInside(baseDir, pathname);
  if (!filePath) return send(response, 403, "Forbidden", "text/plain; charset=utf-8");
  try {
    const data = await fs.readFile(filePath);
    send(response, 200, data, mimeTypes[path.extname(filePath)] || "application/octet-stream");
  } catch {
    send(response, 404, "Not found", "text/plain; charset=utf-8");
  }
}

async function serveStatic(response, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  return serveFile(response, __dirname, cleanPath);
}

async function serveUpload(response, pathname) {
  const uploadPath = pathname.replace(/^\/uploads/, "") || "/";
  return serveFile(response, uploadDir, uploadPath);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname === "/admin" || url.pathname.startsWith("/api/admin/")) {
      if (!requireAdmin(request, response)) return;
    }
    if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url);
    if (url.pathname === "/admin") return await serveStatic(response, "/admin.html");
    if (url.pathname.startsWith("/uploads/")) return await serveUpload(response, url.pathname);
    return await serveStatic(response, url.pathname);
  } catch (error) {
    send(response, error.statusCode || 500, { error: error.message || "Server error" });
  }
});

server.listen(port, host, () => {
  console.log(`Smart Wardrobe app: http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`);
  console.log(`Admin dashboard: http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/admin`);
  if (!adminPassword) console.log("Warning: ADMIN_PASSWORD is not set. Admin dashboard is unprotected.");
});
