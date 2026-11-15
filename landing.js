const entry = document.querySelector('.landing-prompt');
const back = document.querySelector('#back-to-entrance');
let entered = false;
function enterRabbitHole() {
  if (entered) return;
  entered = true;
  document.body.classList.add('landing-entered');
  window.setTimeout(() => {
    document.querySelector('#choose-path').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    document.querySelector('#choose-path').focus({ preventScroll: true });
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 760);
}
entry.addEventListener('click', enterRabbitHole);
back.addEventListener('click', event => {
  event.preventDefault();
  entered = false;
  document.body.classList.remove('landing-entered');
});
entry.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); enterRabbitHole(); } });
entry.setAttribute('role', 'button');
entry.setAttribute('tabindex', '0');
