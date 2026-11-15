(() => {
  if (navigator.globalPrivacyControl || ['1', 'yes'].includes(navigator.doNotTrack) ||
      ['1', 'yes'].includes(window.doNotTrack) || document.getElementById('vercel-insights')) return;

  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.va('beforeSend', event => {
    const url = new URL(event.url, window.location.origin);
    url.search = '';
    url.hash = '';
    if (/^\/community-reviews\/[^/]+\/?$/i.test(url.pathname)) {
      url.pathname = '/community-reviews/:id';
    }
    return {...event, url: url.href};
  });
  const script = document.createElement('script');
  script.id = 'vercel-insights';
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  document.head.append(script);
})();
