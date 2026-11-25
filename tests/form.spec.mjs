import { test, expect } from '@playwright/test';

// Bloqueia a Meta e registra as chamadas de fbq; simula o Web3Forms conforme o cenário.
// Nenhum teste envia dados reais.
async function setup(page, { web3 } = {}) {
  await page.route(/connect\.facebook\.net|facebook\.com\/tr/, (r) => r.abort());
  await page.addInitScript(() => {
    window.__fbqCalls = [];
    window.fbq = (...a) => window.__fbqCalls.push(a);
  });
  const posts = [];
  await page.route('https://api.web3forms.com/submit', async (route) => {
    posts.push(route.request().postDataJSON());
    if (web3 === 'offline') return route.abort('internetdisconnected');
    if (web3 === 'http500') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false}' });
    if (web3 === 'fail200') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":false}' });
    await new Promise((r) => setTimeout(r, 300));
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  return posts;
}
const events = (page) => page.evaluate(() => window.__fbqCalls.filter((c) => c[0] === 'track' || c[0] === 'trackCustom').map((c) => c[1]));
const submit = (page) => page.click('#stay-form button[type=submit]');

async function fill(page) {
  await page.fill('#nome', 'TESTE automatizado - nao contatar');
  await page.locator('#whatsapp').pressSequentially('48912345678');
  await page.selectOption('#perfil', 'Pousada');
  await page.selectOption('#unidades', '6 a 20');
  await page.fill('#cidade', 'Florianópolis / SC');
  await page.check('input[name="consentimento"]');
}

test('topo repete a chamada do anúncio, PageView único e sem erros', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check-in sem chave no seu imóvel de temporada.');
  await expect(page.locator('.hero__media img')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const inits = await page.evaluate(() => window.__fbqCalls.filter((c) => c[0] === 'init').map((c) => c[1]));
  expect(inits).toEqual(['351480523756375']);
  expect(await events(page)).toEqual(['PageView']);
  expect(errors).toEqual([]);
});

test('formulário incompleto ou sem consentimento: nenhum envio e nenhum Lead', async ({ page }) => {
  const posts = await setup(page, { web3: 'ok' });
  await page.goto('/');
  await submit(page);
  await fill(page);
  await page.uncheck('input[name="consentimento"]');
  await submit(page);
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(0);
  expect(await events(page)).toEqual(['PageView']);
});

test('WhatsApp inválido bloqueia o envio', async ({ page }) => {
  const posts = await setup(page, { web3: 'ok' });
  await page.goto('/');
  await fill(page);
  await page.fill('#whatsapp', '');
  await page.locator('#whatsapp').pressSequentially('4891234');
  await submit(page);
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(0);
  await expect(page.locator('#whatsapp')).toHaveAttribute('aria-invalid', 'true');
});

for (const mode of ['http500', 'fail200', 'offline']) {
  test(`envio com falha (${mode}): sem Lead e com contingência por e-mail`, async ({ page }) => {
    const posts = await setup(page, { web3: mode });
    await page.goto('/');
    await fill(page);
    await submit(page);
    await expect(page.locator('[data-form-status]')).toHaveAttribute('data-state', 'error');
    expect(posts).toHaveLength(1);
    expect(await events(page)).toEqual(['PageView']);
  });
}

test('envio confirmado: lp-hospedagem, UTMs nos campos ocultos e um único Lead mesmo com clique duplo', async ({ page }) => {
  const posts = await setup(page, { web3: 'ok' });
  await page.goto('/?utm_source=meta&utm_medium=paid&utm_campaign=Integradores%20%7C%20Open%20Gate&utm_content=OpenGate%20%7C%20Hospedagem&utm_term=Hospedagem&fbclid=abc');
  await fill(page);
  await page.locator('#stay-form button[type=submit]').dblclick();
  await expect(page.locator('[data-form-status]')).toHaveAttribute('data-state', 'success');
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(1);
  const p = posts[0];
  expect(p.access_key).toBe('fdaaa58c-d398-4d79-8159-344158278c23');
  expect(p.subject).toBe('Novo interessado — OpenGate Hospedagem (lp-hospedagem)');
  expect(p['Página']).toBe('lp-hospedagem');
  expect(p.Nome).toBe('TESTE automatizado - nao contatar');
  expect(p.WhatsApp).toBe('(48) 91234-5678');
  expect(p.Perfil).toBe('Pousada');
  expect(p.Unidades).toBe('6 a 20');
  expect(p['Cidade / UF']).toBe('Florianópolis / SC');
  expect(p['Consentimento LGPD']).toMatch(/^Sim \(/);
  expect(p.utm_source).toBe('meta');
  expect(p.utm_campaign).toBe('Integradores | Open Gate');
  expect(p.utm_content).toBe('OpenGate | Hospedagem');
  expect(p.utm_term).toBe('Hospedagem');
  expect(await events(page)).toEqual(['PageView', 'Lead']);
  const lead = await page.evaluate(() => window.__fbqCalls.find((c) => c[1] === 'Lead'));
  expect(lead[2]).toEqual({ content_name: 'OpenGate Hospedagem', perfil: 'pousada', unidades: '6 a 20' });
  expect(lead[3].eventID).toMatch(/^lead-/);
  expect(JSON.stringify(lead)).not.toContain('TESTE');
  expect(JSON.stringify(lead)).not.toContain('91234');
  expect(JSON.stringify(lead)).not.toContain('Florian');
  // Depois do envio, a origem continua nos campos ocultos para um novo envio
  expect(await page.inputValue('input[name="utm_source"]')).toBe('meta');
});

test('privacidade abre, cita o integrador parceiro e explica a exclusão', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  const href = await page.locator('.consent a').getAttribute('href');
  const response = await page.goto(new URL(href, page.url()).toString());
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Política de Privacidade');
  await expect(page.getByText('integrador parceiro da sua região').first()).toBeVisible();
  await expect(page.getByText('Exclusão de dados')).toBeVisible();
});

test('sem rolagem horizontal', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
