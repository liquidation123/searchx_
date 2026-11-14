// Case A from SIEVE-public at d9e19736fc0925e2336b56e3bf6ff810e8d1554b.
const ra = 232.64278847144752;
const dec = -10.546006460187737;
const productRoot = '/qr3/level2/2026W30_1B/l2b-v27-2026-222/1/';

export const sieveDemo = {
  id: 'sieve-demo-a-v1', name: 'SIEVE demo candidate A', ra, dec,
  sieveCommit: 'd9e19736fc0925e2336b56e3bf6ff810e8d1554b',
  summary: 'Tentative catalog association. The measured centroid separation was 0.794 arcseconds. Registration was unqualified for motion, and calibration was insufficient for brightness variability.',
  frames: [
    ['2026W30_1B_0001_1', '2026-07-20T00:06:53.370Z', 61241.004784375,
      '13434d8c4615a7b788594d3065809c61dfa5c28d5fae6590cf5d7e8b952a4117'],
    ['2026W30_1B_0001_2', '2026-07-20T00:09:02.301Z', 61241.006276632,
      '0d6297702adcbb65786230b1ed7f9c4e6a58e1746885d8dd5ebbc46c8be24fc9'],
  ].map(([id, observedAt, mjd, cutoutSha256]) => {
    const path = productRoot + 'level2_' + id + 'D1_spx_l2b-v27-2026-222.fits';
    const sourceUrl = 'https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com' + path;
    const cutoutUrl = new URL('https://irsa.ipac.caltech.edu/ibe/data/spherex' + path);
    cutoutUrl.search = new URLSearchParams({ center: ra + ',' + dec, size: '0.1' });
    return {id, observedAt, mjd, detector: 'SPHEREx-D1', release: 'QR3', sourceUrl, evidence: true,
      cutoutUrl: cutoutUrl.href, cutoutSha256};
  }),
};
