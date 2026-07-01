import type { MiddlewareHandler } from "hono";

const BODY_SIZE_LIMIT = 1024 * 64; // 64KB

export const bodySizeLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const contentLength = Number(c.req.header("Content-Length") ?? 0);
  if (contentLength > BODY_SIZE_LIMIT) {
    return c.json({ error: "Payload Too Large" }, 413);
  }
  await next();
};
