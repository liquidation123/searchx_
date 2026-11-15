export function serveAnalyticsConfig(request, response) {
  const token = process.env.MIXPANEL_ENABLED === 'true' ? process.env.MIXPANEL_TOKEN?.trim() : null;
  const country = request.headers['x-vercel-ip-country'];
  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }).end(JSON.stringify({
    token: token && /^[a-zA-Z0-9]{16,64}$/.test(token) ? token : null,
    region: process.env.MIXPANEL_REGION?.toUpperCase() === 'EU' ? 'EU' : 'US',
    country: typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : null,
  }));
}
