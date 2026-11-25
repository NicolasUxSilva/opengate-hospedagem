// Landing page de hospedagem OpenGate (anfitriões, pousadas e administradoras).
import { formatPhone, isValidPhone, PHONE_ERROR_MESSAGE } from './phone.js';
import { captureCampaignParams, fillHiddenFields, TRACKED_PARAMS } from './utm.js';

// Envio pelo Web3Forms, com a mesma chave (e o mesmo e-mail de destino) da página de integradores.
// O assunto e o campo "Página" identificam os leads desta página como "lp-hospedagem".
const FORM_ENDPOINT = 'https://api.web3forms.com/submit';
const PAGE_ID = 'lp-hospedagem';
const FORM_SUBJECT = `Novo interessado — OpenGate Hospedagem (${PAGE_ID})`;
const FORM_SENDER = 'Landing page de hospedagem OpenGate';

// Destino do e-mail de contingência (mailto), usado quando o envio pelo site falha.
const FORM_EMAIL = 'suporte@msserver.com.br';

const STATUS_MESSAGES = {
  success: 'Recebemos seus dados! Nossa equipe fala com você pelo WhatsApp em breve.',
  error: 'Não foi possível enviar pelo site agora. Envie seus dados por e-mail — a mensagem já vem preenchida:',
};

// Rótulos no e-mail recebido, na ordem do formulário.
const FIELD_LABELS = {
  nome: 'Nome',
  whatsapp: 'WhatsApp',
  perfil: 'Perfil',
  unidades: 'Unidades',
  cidade: 'Cidade / UF',
};

function labeledAnswers(data) {
  return Object.fromEntries(Object.entries(FIELD_LABELS).map(([name, label]) => [label, data[name] || 'Não informado']));
}

function buildMailtoLink(data) {
  const lines = Object.entries(labeledAnswers(data)).map(([label, value]) => `${label}: ${value}`);
  const params = new URLSearchParams({ subject: FORM_SUBJECT, body: lines.join('\n') });
  return `mailto:${FORM_EMAIL}?${params.toString().replace(/\+/g, '%20')}`;
}

// Perfil e faixa de unidades vão como parâmetros do Lead (para medir qualidade); nome, WhatsApp e
// cidade nunca vão ao Pixel.
function profileKey(perfil) {
  if (/^Anfitri/.test(perfil || '')) return 'anfitriao';
  if (/^Pousada/.test(perfil || '')) return 'pousada';
  if (/^Administradora/.test(perfil || '')) return 'administradora';
  return 'outro';
}

// Conversão da campanha: só depois que o Web3Forms confirmou o envio (success === true).
// Um único Lead por envio confirmado, com eventID próprio para a Meta deduplicar.
function trackLead(data) {
  try {
    const eventID = `lead-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.fbq?.('track', 'Lead', { content_name: 'OpenGate Hospedagem', perfil: profileKey(data.perfil), unidades: data.unidades || '' }, { eventID });
  } catch {
    // Mensuração nunca deve atrapalhar o envio.
  }
}

function initStayForm() {
  const form = document.getElementById('stay-form');
  if (!form) return;

  const button = form.querySelector('button[type="submit"]');
  const label = form.querySelector('[data-submit-label]');
  const status = form.querySelector('[data-form-status]');
  const idleLabel = label.textContent;
  let submitting = false;
  const campaign = captureCampaignParams();
  fillHiddenFields(form, campaign);

  const showStatus = (type, mailto) => {
    status.textContent = STATUS_MESSAGES[type];
    if (mailto) {
      const link = document.createElement('a');
      link.className = 'form-status__action';
      link.href = mailto;
      link.textContent = 'Enviar por e-mail';
      status.append(link);
    }
    status.dataset.state = type;
    status.hidden = false;
  };

  // WhatsApp: máscara enquanto digita e validação nativa (bloqueia o envio se inválido).
  const phone = form.querySelector('#whatsapp');
  const phoneHint = form.querySelector('#whatsapp-hint');
  const phoneHintText = phoneHint.textContent;
  const validatePhone = (showError) => {
    const ok = !phone.value || isValidPhone(phone.value);
    phone.setCustomValidity(ok ? '' : PHONE_ERROR_MESSAGE);
    const visible = showError && !ok;
    phone.setAttribute('aria-invalid', String(visible));
    phoneHint.textContent = visible ? PHONE_ERROR_MESSAGE : phoneHintText;
    if (visible) phoneHint.dataset.error = '';
    else delete phoneHint.dataset.error;
  };
  phone.addEventListener('input', () => {
    phone.value = formatPhone(phone.value);
    validatePhone(phone.getAttribute('aria-invalid') === 'true');
  });
  phone.addEventListener('blur', () => validatePhone(Boolean(phone.value)));
  form.addEventListener('invalid', (event) => { if (event.target === phone) validatePhone(Boolean(phone.value)); }, true);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return; // impede envio duplo (e Lead duplo)
    validatePhone(true);
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    submitting = true;

    const data = Object.fromEntries(new FormData(form));
    data.whatsapp = formatPhone(data.whatsapp);
    const payload = {
      access_key: data.access_key,
      botcheck: data.botcheck,
      ...labeledAnswers(data),
      'Consentimento LGPD': data.consentimento === 'Sim' ? `Sim (${new Date().toISOString()})` : 'Não',
      Página: PAGE_ID,
      ...Object.fromEntries(TRACKED_PARAMS.map((key) => [key, data[key] || ''])),
      subject: FORM_SUBJECT,
      from_name: FORM_SENDER,
    };

    button.disabled = true;
    label.textContent = 'Enviando...';
    status.hidden = true;

    try {
      if (!data.access_key) throw new Error('access_key do Web3Forms não configurada em index.html');
      const response = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || String(result.success) !== 'true') throw new Error(result.message || response.status);

      form.reset();
      fillHiddenFields(form, campaign);
      showStatus('success');
      // Armadilha anti-spam preenchida = robô: não conta como Lead.
      if (!data.botcheck) trackLead(data);
    } catch (error) {
      console.warn('Falha no envio do formulário de hospedagem:', error);
      showStatus('error', buildMailtoLink(data));
    } finally {
      submitting = false;
      button.disabled = false;
      label.textContent = idleLabel;
    }
  });
}

document.addEventListener('DOMContentLoaded', initStayForm);
