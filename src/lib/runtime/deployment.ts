export function isHostedRuntime() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_URL);
}
