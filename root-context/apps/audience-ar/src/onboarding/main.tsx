/**
 * Onboarding entry-point stub.
 *
 * The onboarding.html in this app references this file, but the real
 * onboarding implementation hasn't been committed yet by the teammate
 * who set it up. This stub keeps the build green; replace with the real
 * onboarding entry when ready.
 */

const root = document.getElementById('root');
if (root) {
  root.innerHTML = `
    <div style="
      display:flex; align-items:center; justify-content:center;
      width:100vw; height:100vh; background:#000; color:#fff;
      font-family: system-ui, sans-serif; text-align:center; padding:24px;
    ">
      <div>
        <h1 style="margin:0 0 12px; font-size:1.5rem;">ROOT — Onboarding</h1>
        <p style="opacity:0.7; font-size:0.95rem;">Coming soon.</p>
      </div>
    </div>
  `;
}
