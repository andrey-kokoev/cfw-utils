/**
 * Generates the widget.js script content that gets injected into client pages.
 */
export function generateWidgetScript(endpoint: string, defaultRepo: string, defaultLabels: string[]): string {
  const defaultLabelsStr = defaultLabels.join(",");

  return `
(function() {
  'use strict';
  
  const config = {
    endpoint: '${endpoint}',
    repo: '${defaultRepo}',
    labels: '${defaultLabelsStr}'
  };

  let modal = null;
  let isSubmitting = false;
  let cooldownTimer = null;
  let lastSubmitTime = 0;
  const COOLDOWN_MS = 60000; // 60 seconds

  function createStyles() {
    const style = document.createElement('style');
    style.textContent = \`
      #cfw-feedback-widget { position: fixed; bottom: 20px; right: 20px; z-index: 9999; font-family: system-ui, -apple-system, sans-serif; }
      #cfw-feedback-btn { width: 56px; height: 56px; border-radius: 50%; background: #2563eb; color: white; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; transition: transform 0.2s, background 0.2s; }
      #cfw-feedback-btn:hover { transform: scale(1.05); background: #1d4ed8; }
      #cfw-feedback-btn svg { width: 24px; height: 24px; }
      #cfw-feedback-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 10000; }
      #cfw-feedback-modal.active { display: flex; }
      #cfw-feedback-form { background: white; border-radius: 12px; width: 90%; max-width: 480px; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: cfw-slide-in 0.3s ease; }
      @keyframes cfw-slide-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      #cfw-feedback-form h3 { margin: 0 0 16px; font-size: 20px; color: #111; }
      #cfw-feedback-form input, #cfw-feedback-form textarea { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 12px; font-size: 14px; box-sizing: border-box; font-family: inherit; }
      #cfw-feedback-form input:focus, #cfw-feedback-form textarea:focus { outline: none; border-color: #2563eb; }
      #cfw-feedback-form textarea { min-height: 120px; resize: vertical; }
      #cfw-feedback-form .cfw-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px; }
      #cfw-feedback-form button { padding: 10px 20px; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 500; }
      #cfw-feedback-form .cfw-cancel { background: #f3f4f6; color: #374151; border: none; }
      #cfw-feedback-form .cfw-cancel:hover { background: #e5e7eb; }
      #cfw-feedback-form .cfw-submit { background: #2563eb; color: white; border: none; }
      #cfw-feedback-form .cfw-submit:hover { background: #1d4ed8; }
      #cfw-feedback-form .cfw-submit:disabled { opacity: 0.6; cursor: not-allowed; }
      #cfw-feedback-form .cfw-error { color: #dc2626; font-size: 13px; margin-top: 8px; display: none; }
      #cfw-feedback-form .cfw-error.active { display: block; }
      #cfw-feedback-form .cfw-success { text-align: center; padding: 20px; }
      #cfw-feedback-form .cfw-success svg { width: 48px; height: 48px; color: #16a34a; margin-bottom: 12px; }
      #cfw-feedback-form .cfw-success h4 { margin: 0 0 8px; color: #111; }
      #cfw-feedback-form .cfw-success p { margin: 0; color: #666; font-size: 14px; }
    \`;
    return style;
  }

  function createButton() {
    const btn = document.createElement('button');
    btn.id = 'cfw-feedback-btn';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>';
    btn.setAttribute('aria-label', 'Send feedback');
    btn.onclick = openModal;
    return btn;
  }

  function createModal() {
    const modalEl = document.createElement('div');
    modalEl.id = 'cfw-feedback-modal';
    modalEl.innerHTML = \`
      <form id="cfw-feedback-form">
        <h3>Send Feedback</h3>
        <input type="text" id="cfw-title" placeholder="Title" required maxlength="500">
        <textarea id="cfw-description" placeholder="Describe your feedback..." required maxlength="5000"></textarea>
        <div class="cfw-error" id="cfw-error"></div>
        <div class="cfw-actions">
          <button type="button" class="cfw-cancel" onclick="CFWidget.close()">Cancel</button>
          <button type="submit" class="cfw-submit">Submit</button>
        </div>
      </form>
    \`;
    modalEl.onclick = (e) => { if (e.target === modalEl) closeModal(); };
    return modalEl;
  }

  function showSuccess() {
    const form = document.getElementById('cfw-feedback-form');
    form.innerHTML = \`
      <div class="cfw-success">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <h4>Thank you!</h4>
        <p>Your feedback has been submitted.</p>
      </div>
    \`;
    setTimeout(closeModal, 2000);
  }

  function showError(msg) {
    const err = document.getElementById('cfw-error');
    err.textContent = msg;
    err.classList.add('active');
  }

  function clearError() {
    const err = document.getElementById('cfw-error');
    err.classList.remove('active');
  }

  function init() {
    if (document.getElementById('cfw-feedback-widget')) return;
    const container = document.createElement('div');
    container.id = 'cfw-feedback-widget';
    container.appendChild(createStyles());
    container.appendChild(createButton());
    modal = createModal();
    container.appendChild(modal);
    document.body.appendChild(container);

    document.getElementById('cfw-feedback-form').onsubmit = async (e) => {
      e.preventDefault();
      clearError();
      
      const now = Date.now();
      if (now - lastSubmitTime < COOLDOWN_MS) {
        showError('Please wait a moment before submitting again.');
        return;
      }

      const title = document.getElementById('cfw-title').value.trim();
      const description = document.getElementById('cfw-description').value.trim();
      
      if (!title || !description) {
        showError('Please fill in all fields.');
        return;
      }

      const submitBtn = document.querySelector('#cfw-feedback-form .cfw-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      try {
        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description,
            url: window.location.href,
            userAgent: navigator.userAgent,
            labels: config.labels.split(',').filter(Boolean)
          })
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error?.error || 'Failed to submit feedback');
        }

        lastSubmitTime = Date.now();
        showSuccess();
      } catch (err) {
        showError(err.message || 'Something went wrong. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      }
    };
  }

  function openModal() {
    if (modal) {
      modal.classList.add('active');
      document.getElementById('cfw-title').focus();
    }
  }

  function closeModal() {
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => {
        const form = document.getElementById('cfw-feedback-form');
        if (form) {
          form.reset();
          clearError();
          const submitBtn = form.querySelector('.cfw-submit');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit';
          }
        }
      }, 300);
    }
  }

  function submit(data) {
    if (!data.title || !data.description) {
      throw new Error('Title and description are required');
    }
    return fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        url: data.url || window.location.href,
        userAgent: navigator.userAgent,
        labels: data.labels || config.labels.split(',').filter(Boolean)
      })
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.CFWidget = { open: openModal, close: closeModal, submit };
})();
  `.trim();
}
