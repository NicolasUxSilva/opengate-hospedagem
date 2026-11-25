// Verificação rápida: arquivos referenciados existem, âncoras resolvem, JS/CSS válidos,
// formulário e Pixel configurados. Uso: npm run check
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatPhone, isValidPhone } from '../js/phone.js';
import { readCampaignParams } from '../js/utm.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

for (const page of ['index.html', 'privacidade/index.html']) {
  const html = readFileSync(resolve(ROOT, page), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const base = dirname(resolve(ROOT, page));
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, attr, value] of html.matchAll(/\s(src|href)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:)/.test(value)) continue;
    if (value.startsWith('#')) {
      if (!ids.has(value.slice(1))) errors.push(`${page}: ${attr}="${value}" aponta para id inexistente`);
      continue;
    }
    const target = value.split('#')[0];
    if (target && !existsSync(resolve(base, target))) errors.push(`${page}: ${attr}="${value}" não encontrado`);
  }
}

const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
// Mesma chave do Web3Forms da página de integradores.
if (!/name="access_key" value="fdaaa58c-d398-4d79-8159-344158278c23"/.test(html)) errors.push('formulário: access_key do Web3Forms diferente da página de integradores');
for (const name of ['nome', 'whatsapp', 'perfil', 'unidades', 'cidade', 'consentimento']) {
  if (!new RegExp(`name="${name}"[^>]*\\srequired`).test(html)) errors.push(`formulário: campo obrigatório "${name}" ausente`);
}
for (const name of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'origem']) {
  if (!new RegExp(`type="hidden" name="${name}"`).test(html)) errors.push(`formulário: campo oculto "${name}" ausente`);
}
const pixelInits = [...html.matchAll(/fbq\('init',\s*'(\d+)'\)/g)].map((m) => m[1]);
if (pixelInits.length !== 1 || pixelInits[0] !== '351480523756375') errors.push(`Meta Pixel: esperado 1 init com 351480523756375, encontrado ${JSON.stringify(pixelInits)}`);
if (/'Lead'/.test(html)) errors.push('Meta Pixel: Lead não pode ser disparado no HTML');
const mainJs = readFileSync(resolve(ROOT, 'js/main.js'), 'utf8');
if ((mainJs.match(/trackLead\(/g) || []).length !== 2) errors.push('Meta Pixel: trackLead deve ser chamado em um único ponto (após sucesso)');
if (!/lp-hospedagem/.test(mainJs)) errors.push('formulário: identificação lp-hospedagem ausente');

for (const file of ['js/main.js', 'js/phone.js', 'js/utm.js', 'scripts/serve.mjs']) {
  try {
    execFileSync(process.execPath, ['--check', resolve(ROOT, file)], { stdio: 'pipe' });
  } catch (err) {
    errors.push(`sintaxe inválida em ${file}: ${err.stderr}`);
  }
}
for (const file of ['css/tokens.css', 'css/base.css', 'css/sections.css', 'css/hospedagem.css', 'css/form.css', 'css/legal.css']) {
  const src = readFileSync(resolve(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  if ((src.match(/{/g) || []).length !== (src.match(/}/g) || []).length) errors.push(`chaves desbalanceadas em ${file}`);
}

if (!isValidPhone('(11) 91234-5678') || isValidPhone('1191234') || formatPhone('+55 11 91234-5678') !== '(11) 91234-5678') errors.push('telefone: máscara/validação quebradas');
const utm = readCampaignParams('?utm_source=meta&utm_campaign=Hospedagem&nome=Fulano&origem=x');
if (JSON.stringify(utm) !== JSON.stringify({ utm_source: 'meta', utm_campaign: 'Hospedagem', origem: 'x' })) errors.push(`utm: leitura incorreta ${JSON.stringify(utm)}`);

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log('✓ referências, âncoras, formulário, Pixel, JS e CSS ok');
