export function serveAnalyticsConfig(request, response) {
  const token = process.env.MIXPANEL_TOKEN?.trim();
  const country = request.headers['x-vercel-ip-country'];
  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }).end(JSON.stringify({
    token: token && /^[a-zA-Z0-9]{16,64}$/.test(token) ? token : null,
    country: typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : null,
  }));
}
