'use strict';

(() => {
  const query = new URLSearchParams(location.search);
  const id = query.get('id') || '';
  const view = query.get('view') === 'quote' ? 'quote' : 'proposal';
  const state = document.getElementById('proposal-state');
  const content = document.getElementById('proposal-content');
  const form = document.getElementById('response-form');
  const actions = document.getElementById('response-actions');
  const status = document.getElementById('response-status');
  const nameInput = document.getElementById('response-name');
  const messageInput = document.getElementById('response-message');
  const acceptConfirmation = document.getElementById('accept-confirmation');
  const submitButton = document.getElementById('submit-response');
  let action = '';

  function showError(message) {
    state.innerHTML = '';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'EVR PRODUCTIONS / QUOTATION';
    const heading = document.createElement('h1');
    heading.textContent = 'This link is unavailable.';
    const detail = document.createElement('p');
    detail.textContent = message;
    state.append(eyebrow, heading, detail);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(value);
  }

  function formatDate(value) {
    if (!value) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return value;
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  function appendText(parent, tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    parent.append(element);
    return element;
  }

  function renderEvent(event) {
    const item = document.createElement('article');
    item.className = 'event-item';
    const heading = document.createElement('div');
    heading.className = 'event-title';
    appendText(heading, 'span', '', event.name);
    const date = formatDate(event.date);
    if (date) appendText(heading, 'span', '', date);
    item.append(heading);
    if (event.session) appendText(item, 'p', 'event-meta', event.session);
    if (event.requirements.length) appendText(item, 'p', 'event-requirements', event.requirements.join(' · '));
    for (const day of event.days) {
      const details = [day.date && formatDate(day.date), day.session, ...day.requirements].filter(Boolean).join(' · ');
      if (details) appendText(item, 'p', 'event-meta', `Day ${day.number}: ${details}`);
    }
    return item;
  }

  function renderQuote(quote, saved) {
    const client = quote.client || 'there';
    document.title = `Quotation for ${client} | EVR Productions`;
    document.getElementById('proposal-kicker').textContent =
      view === 'quote' ? 'YOUR EVR QUOTATION' : 'A PERSONAL EVR PROPOSAL';
    document.getElementById('proposal-title').textContent =
      quote.groom && quote.bride && quote.groom !== 'Groom' && quote.bride !== 'Bride'
        ? `${quote.groom} & ${quote.bride}, your story starts here.`
        : `${client}, your story starts here.`;
    document.getElementById('proposal-description').textContent =
      view === 'quote'
        ? 'Here are the details of your quotation, along with a few ways to get to know EVR.'
        : 'A personal quotation, with a little more about the people and approach behind it.';
    document.getElementById('proposal-reference').textContent = quote.reference ? `Reference ${quote.reference}` : 'Prepared by EVR Productions';
    document.getElementById('proposal-date').textContent = quote.date ? `Event date: ${formatDate(quote.date)}` : '';
    document.getElementById('quote-total').textContent = formatMoney(quote.total);

    const events = document.getElementById('quote-events');
    for (const event of quote.events) events.append(renderEvent(event));
    document.getElementById('events-section').hidden = quote.events.length === 0;

    const deliverables = document.getElementById('quote-deliverables');
    for (const item of quote.deliverables) appendText(deliverables, 'li', '', item);
    document.getElementById('deliverables-section').hidden = quote.deliverables.length === 0;
    document.getElementById('quote-terms').textContent = quote.terms;
    document.getElementById('terms-section').hidden = !quote.terms;

    const respond = saved.response;
    if (respond) {
      actions.hidden = true;
      const who = respond.acceptedBy ? ` by ${respond.acceptedBy}` : '';
      status.textContent = respond.action === 'accepted'
        ? `This quotation was accepted${who}. Thank you.`
        : `A change request was submitted${who}. EVR will be in touch.`;
      return;
    }
    document.getElementById('accept-button').addEventListener('click', () => openForm('accept'));
    document.getElementById('changes-button').addEventListener('click', () => openForm('request-changes'));
  }

  function openForm(nextAction) {
    action = nextAction;
    const requestingChanges = action === 'request-changes';
    document.getElementById('accept-check').hidden = requestingChanges;
    acceptConfirmation.required = !requestingChanges;
    document.getElementById('message-label').hidden = !requestingChanges;
    messageInput.hidden = !requestingChanges;
    messageInput.required = requestingChanges;
    submitButton.textContent = requestingChanges ? 'Send change request' : 'Confirm acceptance';
    form.hidden = false;
    nameInput.focus();
  }

  document.getElementById('cancel-response').addEventListener('click', () => {
    form.hidden = true;
    form.reset();
    status.textContent = '';
    status.removeAttribute('data-error');
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    status.textContent = '';
    status.removeAttribute('data-error');
    if (action === 'accept' && !acceptConfirmation.checked) {
      status.textContent = 'Please confirm that you accept the quotation and terms.';
      status.dataset.error = 'true';
      return;
    }
    submitButton.disabled = true;
    submitButton.textContent = 'Sending…';
    try {
      const response = await fetch('/api/quote-maker/quotes', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          id,
          name: nameInput.value.trim(),
          accepted: action === 'accept',
          message: messageInput.value.trim()
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your response could not be sent.');
      actions.hidden = true;
      form.hidden = true;
      status.textContent = result.accepted
        ? 'Thank you. Your acceptance has been recorded.'
        : 'Thank you. Your requested changes have been sent to EVR.';
    } catch (error) {
      status.textContent = error.message || 'Your response could not be sent. Please try again.';
      status.dataset.error = 'true';
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = action === 'request-changes' ? 'Send change request' : 'Confirm acceptance';
    }
  });

  async function loadSharedLogo() {
    try {
      const response = await fetch('/api/brand-logo', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('The shared EVR logo could not be loaded.');
      const logos = await response.json();
      const logo = document.querySelector('[data-proposal-logo]');
      if (logos.light) logo.src = logos.light;
    } catch (error) {
      console.warn('Using the default EVR proposal logo.', error);
    }
  }

  async function loadProposal() {
    if (!/^[a-f0-9]{48}$/.test(id)) {
      showError('Please check the link or contact EVR Productions for a new quotation.');
      return;
    }
    try {
      const response = await fetch(`/api/quote-maker/quotes?id=${encodeURIComponent(id)}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Please contact EVR Productions for help.');
      renderQuote(result.quote, result);
      state.hidden = true;
      content.hidden = false;
    } catch (error) {
      showError(error.message || 'Please contact EVR Productions for help.');
    }
  }

  loadSharedLogo();
  loadProposal();
})();
