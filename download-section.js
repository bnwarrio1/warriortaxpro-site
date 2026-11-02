// The Download section (ruled 2026-11-02): offices download the installer from the relay, the one
// trusted origin, never a third-party file host. Everything shown comes from download.json, which
// the release step writes (installer\dist\download.json), so a new release changes no code here.
// Without a valid file the section says the installer is not released yet and links nothing.
(function () {
  function downloadView(d) {
    if (!d || typeof d !== 'object') return null;
    var url;
    try { url = new URL(d.url); } catch (e) { return null; }
    if (url.protocol !== 'https:') return null;
    if (!/^\d+\.\d+\.\d+$/.test(String(d.version))) return null;
    if (!/^[A-Za-z0-9._-]+\.msi$/.test(String(d.file))) return null;
    if (!/^[0-9a-f]{64}$/.test(String(d.sha256))) return null;
    if (!d.signer || typeof d.signer !== 'string') return null;
    var mb = typeof d.size === 'number' && d.size > 0 ? Math.round(d.size / (1024 * 1024)) + ' MB' : '';
    return {
      href: url.href,
      version: 'Version ' + d.version,
      file: d.file,
      sha256: d.sha256,
      signer: 'Signed by ' + d.signer,
      size: mb,
    };
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { downloadView: downloadView }; return; }

  function show(view) {
    var box = document.getElementById('download-release');
    var none = document.getElementById('download-none');
    if (!box || !none) return;
    if (!view) { box.hidden = true; none.hidden = false; return; }
    document.getElementById('download-link').href = view.href;
    document.getElementById('download-version').textContent = view.version + (view.size ? ' · ' + view.size : '');
    document.getElementById('download-file').textContent = view.file;
    document.getElementById('download-sha').textContent = view.sha256;
    document.getElementById('download-signer').textContent = view.signer;
    none.hidden = true;
    box.hidden = false;
  }

  fetch('download.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { show(downloadView(d)); })
    .catch(function () { show(null); });
})();
