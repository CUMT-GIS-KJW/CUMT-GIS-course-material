const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 5500);
const ROOT = path.resolve(__dirname);
const GEOSERVER_TARGET = (process.env.GEOSERVER_URL || "http://localhost:8338/geoserver").replace(/\/+$/, "");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  if (isGeoserverRequest(req.url || "")) {
    proxyGeoserver(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`WebGIS system: http://127.0.0.1:${PORT}`);
});

function isGeoserverRequest(url) {
  return url === "/geoserver" || url.startsWith("/geoserver/") || url.startsWith("/geoserver?");
}

function serveStatic(req, res) {
  let pathname;
  try {
    const requestUrl = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch (error) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relativePath);
  const rootRelativePath = path.relative(ROOT, filePath);

  if (rootRelativePath.startsWith("..") || path.isAbsolute(rootRelativePath)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (!isPublicPath(rootRelativePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0"
    });
    res.end(data);
  });
}

function isPublicPath(relativePath) {
  const publicPath = relativePath.split(path.sep).join("/");
  return publicPath === "index.html" || publicPath.startsWith("css/") || publicPath.startsWith("js/");
}

function proxyGeoserver(clientReq, clientRes) {
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": clientReq.headers["access-control-request-headers"] || "Content-Type"
  };

  if (clientReq.method === "OPTIONS") {
    clientRes.writeHead(204, corsHeaders);
    clientRes.end();
    return;
  }

  const targetPath = (clientReq.url || "").replace(/^\/geoserver/, "") || "/";
  const targetUrl = new URL(`${GEOSERVER_TARGET}${targetPath}`);

  const proxyReq = http.request(
    targetUrl,
    {
      method: clientReq.method,
      headers: {
        ...clientReq.headers,
        host: targetUrl.host
      }
    },
    (proxyRes) => {
      const headers = {
        ...proxyRes.headers,
        ...corsHeaders
      };
      delete headers["content-security-policy"];
      clientRes.writeHead(proxyRes.statusCode || 502, headers);
      proxyRes.pipe(clientRes);
    }
  );

  proxyReq.on("error", (error) => {
    clientRes.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    clientRes.end(JSON.stringify({ error: error.message }));
  });

  clientReq.on("aborted", () => proxyReq.destroy());
  clientReq.pipe(proxyReq);
}
