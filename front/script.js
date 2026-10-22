// Se o front não for servido pelo Express (porta 3000), fala com a API direto.
const API = window.API_URL ?? (location.port === '3000' ? '' : 'http://localhost:3000')
const ESTOQUE_BAIXO = 5
const reduzMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches

const $ = (seletor) => document.querySelector(seletor)
const $$ = (seletor) => [...document.querySelectorAll(seletor)]
const estado = {
  produtos: [],
  carregado: false,
  token: null,
  usuario: null,
  editandoId: null,
  filtros: { categoria: '', destaque: false, baixo: false },
}
const ehAdmin = () => estado.usuario?.tipo === 'admin'

// ---------- utilidades ----------
// Cria elementos com textContent (nunca innerHTML), então dados do banco não injetam HTML.
function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag)
  for (const [chave, valor] of Object.entries(props)) {
    if (chave === 'class') el.className = valor
    else if (chave.startsWith('on')) el.addEventListener(chave.slice(2), valor)
    else el.setAttribute(chave, valor)
  }
  el.append(...filhos)
  return el
}

// Ícones fixos (texto escrito aqui no código, nunca vindo do banco).
const traco = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const SVG = {
  ok: traco('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  erro: traco('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>'),
  info: traco('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>'),
  sol: traco('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  lua: traco('<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>'),
  pacote: traco('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>'),
  fogo: traco('<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2 1-3.2 2-4 .2 1.5 1 2.3 2 2.5C11 9 11 6 12 3z"/>'),
  alerta: traco('<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/>'),
  moeda: traco('<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2c-.5-.8-1.5-1.2-2.6-1.2-1.5 0-2.6.8-2.6 2s1 1.7 2.7 2c1.7.3 2.7.8 2.7 2s-1.1 2-2.7 2c-1.2 0-2.2-.5-2.7-1.3M12 6.5V8M12 16v1.5"/>'),
  olho: traco('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  olhoFechado: traco('<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4M6.5 6.6A17 17 0 002 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1M9.9 9.9a3 3 0 004.2 4.2"/>'),
  lupa: traco('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  mais: traco('<path d="M12 5v14M5 12h14"/>'),
  menos: traco('<path d="M5 12h14"/>'),
  lapis: traco('<path d="M4 20l1-4L16.5 4.5a2 2 0 013 3L8 19l-4 1z"/>'),
  lixo: traco('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
}
function icone(nome) {
  const el = h('span', { class: 'ico' })
  el.innerHTML = SVG[nome]
  return el
}
$$('[data-ico]').forEach((el) => { el.classList.add('ico'); el.innerHTML = SVG[el.dataset.ico] })

const dinheiro = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dinheiroCurto = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const normalizar = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Cada categoria ganha sempre a mesma cor (matiz), calculada a partir do nome.
function matizDaCategoria(nome) {
  let hash = 0
  for (const letra of nome) hash = (hash * 31 + letra.charCodeAt(0)) % 360
  return hash
}

// Anima um número de onde ele estava até o novo valor.
function contar(seletor, destino, formatar = (n) => String(Math.round(n))) {
  const el = $(seletor)
  const de = Number(el.dataset.v ?? 0)
  el.dataset.v = destino
  const id = (el._anim = (el._anim || 0) + 1)
  if (reduzMovimento || de === destino) { el.textContent = formatar(destino); return }
  const inicio = performance.now()
  const passo = (agora) => {
    if (el._anim !== id) return
    const t = Math.min((agora - inicio) / 700, 1)
    el.textContent = formatar(de + (destino - de) * (1 - Math.pow(1 - t, 3)))
    if (t < 1) requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
}

// Deixa o botão "carregando" (e guarda o texto original para voltar).
function ocupado(botao, sim, texto) {
  const rot = botao.querySelector('.rot') ?? botao
  if (sim) {
    botao.dataset.rot = rot.textContent
    rot.textContent = texto
  } else if (botao.dataset.rot) {
    rot.textContent = botao.dataset.rot
    delete botao.dataset.rot
  }
  botao.disabled = sim
  botao.classList.toggle('carregando', sim)
}

// ---------- avisos ----------
function toast(texto, tipo = 'ok', acao = null) {
  const duracao = acao ? 7000 : 4000
  let timer
  const fechar = () => {
    clearTimeout(timer)
    item.classList.add('saindo')
    setTimeout(() => item.remove(), 200)
  }
  const item = h('div', { class: `toast t-${tipo}`, role: tipo === 'erro' ? 'alert' : 'status', style: `--dur:${duracao}ms` },
    icone(tipo),
    h('p', {}, texto),
    acao ? h('button', { type: 'button', class: 'toast-acao', onclick: () => { acao.fn(); fechar() } }, acao.rotulo) : '',
    h('button', { type: 'button', class: 'toast-x', 'aria-label': 'Fechar aviso', onclick: fechar }, '×'),
    h('span', { class: 'toast-barra' }))
  $('#toasts').append(item)
  timer = setTimeout(fechar, duracao)
}

// ---------- tema ----------
function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema
  localStorage.setItem('tema', tema)
  $('#btn-tema').innerHTML = SVG[tema === 'dark' ? 'sol' : 'lua']
}
$('#btn-tema').addEventListener('click', () => aplicarTema(document.documentElement.dataset.tema === 'dark' ? 'light' : 'dark'))
aplicarTema(document.documentElement.dataset.tema === 'dark' ? 'dark' : 'light')

// ---------- sessão ----------
// O token (JWT) já carrega nome, email e tipo do usuário; é dele que tiramos os dados.
function lerToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(atob(base64).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))
    return JSON.parse(json)
  } catch {
    return null
  }
}
function usuarioDoToken(token) {
  const dados = token && lerToken(token)
  return dados ? { nome: dados.nome, email: dados.email, tipo: dados.tipo } : null
}
function restaurarSessao() {
  localStorage.removeItem('usuario') // guardado por versões antigas do front
  const token = localStorage.getItem('token')
  const dados = token && lerToken(token)
  if (!dados || (dados.exp && dados.exp * 1000 < Date.now())) {
    localStorage.removeItem('token')
    return
  }
  estado.token = token
  estado.usuario = usuarioDoToken(token)
}

async function api(caminho, opcoes = {}) {
  const ehLogin = caminho === '/login'
  const headers = { 'Content-Type': 'application/json' }
  if (estado.token && !ehLogin) headers.Authorization = `Bearer ${estado.token}`
  if (ehAdmin()) headers.admin = 'true'

  let resposta
  try {
    resposta = await fetch(API + caminho, { ...opcoes, headers })
  } catch {
    throw new Error('Não consegui falar com o servidor. Ele está rodando?')
  }
  const dados = await resposta.json().catch(() => ({}))

  if (resposta.status === 401 && estado.token && !ehLogin) {
    sair()
    throw new Error('Sua sessão expirou. Entre de novo.')
  }
  if (!resposta.ok) throw new Error(dados.erro || 'Algo deu errado.')
  return dados
}

// ---------- lista ----------
const filtrosAtivos = () => Boolean($('#busca').value.trim() || estado.filtros.categoria || estado.filtros.destaque || estado.filtros.baixo)

function filtrados() {
  const busca = normalizar($('#busca').value.trim())
  const { categoria, destaque, baixo } = estado.filtros
  const ordens = {
    nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
    'preco-asc': (a, b) => a.preco - b.preco,
    'preco-desc': (a, b) => b.preco - a.preco,
    'estoque-asc': (a, b) => a.estoque - b.estoque,
  }
  return estado.produtos
    .filter((p) => normalizar(p.nome).includes(busca))
    .filter((p) => !categoria || p.categoria === categoria)
    .filter((p) => !destaque || p.vendeu_muito)
    .filter((p) => !baixo || p.estoque <= ESTOQUE_BAIXO)
    .sort(ordens[$('#ordem').value])
}

function limparFiltros() {
  $('#busca').value = ''
  Object.assign(estado.filtros, { categoria: '', destaque: false, baixo: false })
  render()
}

// Uma etiqueta de produto. Em "preview", é só a pré-visualização do formulário.
function criarCard(p, { n = 0, preview = false } = {}) {
  const semEstoque = p.estoque == null
  const baixo = !semEstoque && p.estoque <= ESTOQUE_BAIXO
  const acesos = semEstoque ? 0 : Math.ceil(Math.min(p.estoque, 20) / 2)
  const textoEstoque = semEstoque ? 'Estoque não informado'
    : p.estoque === 0 ? 'Esgotado'
    : baixo ? `Só ${p.estoque} em estoque` : `${p.estoque} em estoque`

  const card = h('article', { class: baixo ? 'tag baixo' : 'tag' },
    h('span', { class: 'furo' }),
    p.vendeu_muito ? h('span', { class: 'selo' }, icone('fogo'), 'Vendeu muito') : '',
    h('p', { class: 'cat' }, p.categoria),
    h('h3', {}, p.nome),
    h('p', { class: 'preco' }, dinheiro(p.preco)),
    h('div', { class: 'pips', 'aria-hidden': 'true' },
      ...Array.from({ length: 10 }, (_, i) => h('i', i < acesos ? { class: 'on', style: `--i:${i}` } : {}))),
    h('p', { class: 'estoque' }, textoEstoque),
  )
  card.style.setProperty('--h', matizDaCategoria(p.categoria))
  card.style.setProperty('--n', Math.min(n, 12))

  if (!preview) {
    card.dataset.id = p._id
    if (p._id === estado.editandoId) card.classList.add('em-edicao')
    if (ehAdmin()) {
      const excluir = h('button', { type: 'button', class: 'sec perigo' }, icone('lixo'), h('span', { class: 'rot' }, 'Excluir'))
      excluir.addEventListener('click', () => confirmarExclusao(excluir, p))
      card.append(h('div', { class: 'admin' },
        h('button', { type: 'button', class: 'sec', onclick: () => abrirProduto(p) }, icone('lapis'), h('span', { class: 'rot' }, 'Editar')),
        excluir))
    }
  }
  return card
}

function renderChips() {
  const contagem = new Map()
  for (const p of estado.produtos) contagem.set(p.categoria, (contagem.get(p.categoria) ?? 0) + 1)
  const nomes = [...contagem.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const chip = (nome, rotulo, qtd) => {
    const ativo = estado.filtros.categoria === nome
    return h('button', {
      type: 'button',
      class: 'chip',
      'aria-pressed': String(ativo),
      onclick: () => { estado.filtros.categoria = ativo ? '' : nome; render() },
    }, nome ? h('span', { class: 'pto', style: `--h:${matizDaCategoria(nome)}` }) : '', rotulo, h('span', { class: 'qtd' }, String(qtd)))
  }
  $('#chips').replaceChildren(...(nomes.length ? [chip('', 'Todas', estado.produtos.length), ...nomes.map((n) => chip(n, n, contagem.get(n)))] : []))
  $('#chips').hidden = nomes.length === 0
}

function render({ entrada = false } = {}) {
  const lista = filtrados()
  const total = estado.produtos.length
  const ativos = filtrosAtivos()

  renderChips()
  $('#st-destaque-btn').setAttribute('aria-pressed', String(estado.filtros.destaque))
  $('#st-baixo-btn').setAttribute('aria-pressed', String(estado.filtros.baixo))
  $('#btn-limpar').hidden = !ativos
  $('#resumo').replaceChildren(
    h('strong', {}, `${lista.length} de ${total} ${total === 1 ? 'produto' : 'produtos'}`),
    ativos ? ' com os filtros atuais.' : ' no estoque.')

  const caixa = $('#lista')
  if (entrada) {
    caixa.classList.add('entrando')
    setTimeout(() => caixa.classList.remove('entrando'), 1400)
  }

  if (lista.length === 0) {
    const vazio = total === 0
    caixa.replaceChildren(h('div', { class: 'aviso' },
      h('strong', {}, vazio ? 'Nenhum produto cadastrado' : 'Nenhum produto encontrado'),
      vazio ? (ehAdmin() ? 'Use o painel acima para cadastrar o primeiro.' : 'Entre como admin para cadastrar o primeiro.') : 'Tente outro nome ou limpe os filtros.',
      vazio ? '' : h('div', {}, h('button', { type: 'button', class: 'sec', onclick: limparFiltros }, 'Limpar filtros'))))
    return
  }
  caixa.replaceChildren(...lista.map((p, i) => criarCard(p, { n: i })))
}

function atualizarStats() {
  const ps = estado.produtos
  contar('#st-total', ps.length)
  contar('#st-destaque', ps.filter((p) => p.vendeu_muito).length)
  contar('#st-baixo', ps.filter((p) => p.estoque <= ESTOQUE_BAIXO).length)
  contar('#st-valor', ps.reduce((soma, p) => soma + p.preco * p.estoque, 0), dinheiroCurto)
}

function atualizarCategorias() {
  const nomes = [...new Set(estado.produtos.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  if (!nomes.includes(estado.filtros.categoria)) estado.filtros.categoria = ''
  // O formulário sugere as categorias que já existem, evitando "Informática" e "informatica" separadas.
  $('#categorias').replaceChildren(...nomes.map((n) => h('option', { value: n })))
  $('#sugestoes').replaceChildren(...nomes.map((n) => h('button', {
    type: 'button',
    class: 'mini',
    onclick: () => { campos.cat.value = n; atualizarPreview(); campos.cat.focus() },
  }, n)))
}

async function carregar({ silencioso = false } = {}) {
  if (!silencioso) {
    $('#lista').replaceChildren(...Array.from({ length: 6 }, () => h('div', { class: 'esqueleto' })))
    $('#resumo').textContent = 'Carregando produtos...'
  }
  try {
    estado.produtos = await api('/produtos')
    estado.carregado = true
    atualizarCategorias()
    atualizarStats()
    render({ entrada: !silencioso })
  } catch (erro) {
    if (silencioso) { toast(erro.message, 'erro'); return }
    $('#resumo').textContent = ''
    $('#lista').replaceChildren(h('div', { class: 'aviso' },
      h('strong', {}, 'Não foi possível carregar os produtos'), erro.message,
      h('div', {}, h('button', { type: 'button', onclick: () => carregar() }, 'Tentar de novo'))))
  }
}

// Rola até o produto e faz a etiqueta piscar. Se um filtro estiver escondendo ele, limpa os filtros.
function mostrarProduto(id) {
  if (!filtrados().some((p) => p._id === id)) limparFiltros()
  requestAnimationFrame(() => {
    const card = $(`[data-id="${CSS.escape(id)}"]`)
    if (!card) return
    card.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'center' })
    card.classList.add('piscar')
    setTimeout(() => card.classList.remove('piscar'), 2400)
  })
}

// ---------- conta ----------
function atualizarConta() {
  const logado = Boolean(estado.token && estado.usuario)
  $('#btn-entrar').hidden = logado
  $('#btn-sair').hidden = !logado
  $('#usuario').hidden = !logado
  if (logado) {
    $('#avatar').textContent = (estado.usuario.nome || '?').trim().charAt(0).toUpperCase()
    $('#u-nome').textContent = estado.usuario.nome
    $('#u-tipo').textContent = ehAdmin() ? 'Administrador' : 'Cliente'
  }
  $('#hero-titulo').textContent = logado ? `Olá, ${estado.usuario.nome.trim().split(' ')[0]}!` : 'Estoque de produtos'
  $('#hero-sub').textContent = ehAdmin() ? 'Você é administrador: cadastre, edite e exclua produtos por aqui.'
    : logado ? 'Confira o que há no estoque.'
    : 'Veja o que há no estoque. Entre para gerenciar os produtos.'

  $('#painel').hidden = !ehAdmin()
  if (!ehAdmin()) resetarForm()
  if (estado.carregado) render()
}

function sair() {
  estado.token = null
  estado.usuario = null
  localStorage.removeItem('token')
  atualizarConta()
}

// ---------- login ----------
const dlgLogin = $('#dlg-login')
let timerLogin

$('#btn-entrar').addEventListener('click', () => {
  $('#l-erro').hidden = true
  dlgLogin.showModal()
})
$('#btn-sair').addEventListener('click', () => { sair(); toast('Você saiu da conta.', 'info') })

$('#btn-olho').addEventListener('click', () => {
  const mostrar = $('#l-senha').type === 'password'
  $('#l-senha').type = mostrar ? 'text' : 'password'
  $('#btn-olho').innerHTML = SVG[mostrar ? 'olhoFechado' : 'olho']
  $('#btn-olho').setAttribute('aria-pressed', String(mostrar))
  $('#btn-olho').setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha')
})
$('#btn-olho').innerHTML = SVG.olho

function confete() {
  if (reduzMovimento) return
  const cores = ['#ffc93c', '#0e7c66', '#2b5fd9', '#c8372d', '#ffffff']
  $('#confete').replaceChildren(...Array.from({ length: 34 }, (_, i) => {
    const pedaco = h('i')
    pedaco.style.cssText = `--x:${(Math.random() - 0.5) * 360}px;--y:${-70 - Math.random() * 150}px;--r:${Math.random() * 720 - 360}deg;--d:${Math.random() * 150}ms;background:${cores[i % cores.length]}`
    return pedaco
  }))
}

function mostrarSucessoLogin(mensagem, usuario) {
  $('#ok-msg').textContent = mensagem
  $('#ok-nome').textContent = `Bem-vindo(a), ${usuario.nome}!`
  $('#form-login').hidden = true
  $('#login-ok').hidden = false
  confete()
  $('#btn-continuar').focus()
  timerLogin = setTimeout(() => dlgLogin.close(), 2200)
}

$('#form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault()
  const botao = $('#btn-login')
  $('#l-erro').hidden = true
  ocupado(botao, true, 'Entrando')
  let dados
  try {
    dados = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('#l-email').value.trim(), senha: $('#l-senha').value }),
    })
  } catch (erro) {
    $('#l-erro').textContent = erro.message
    $('#l-erro').hidden = false
    dlgLogin.classList.add('tremer')
    dlgLogin.addEventListener('animationend', () => dlgLogin.classList.remove('tremer'), { once: true })
    return
  } finally {
    ocupado(botao, false)
  }

  const usuario = dados.usuario ?? usuarioDoToken(dados.token)
  if (!dados.token || !usuario) {
    $('#l-erro').textContent = 'O servidor respondeu algo inesperado. Tente de novo.'
    $('#l-erro').hidden = false
    return
  }
  estado.token = dados.token
  estado.usuario = { nome: usuario.nome, email: usuario.email, tipo: usuario.tipo }
  localStorage.setItem('token', dados.token)
  atualizarConta()
  mostrarSucessoLogin(dados.mensagem || 'Login realizado com sucesso', estado.usuario)
})

$('#btn-continuar').addEventListener('click', () => dlgLogin.close())
dlgLogin.addEventListener('close', () => {
  clearTimeout(timerLogin)
  const entrou = !$('#login-ok').hidden
  $('#login-ok').hidden = true
  $('#form-login').hidden = false
  $('#form-login').reset()
  $('#l-senha').type = 'password'
  $('#btn-olho').innerHTML = SVG.olho
  if (entrou) toast('Login realizado com sucesso!', 'ok')
})

// ---------- cadastro e edição de produtos ----------
const campos = {
  nome: $('#p-nome'),
  preco: $('#p-preco'),
  estoque: $('#p-estoque'),
  cat: $('#p-cat'),
  destaque: $('#p-destaque'),
}

function atualizarPreview() {
  const preco = Number(campos.preco.value)
  $('#preview').replaceChildren(criarCard({
    nome: campos.nome.value.trim() || 'Nome do produto',
    preco: Number.isFinite(preco) ? preco : 0,
    categoria: campos.cat.value.trim() || 'Categoria',
    estoque: campos.estoque.value === '' ? null : Number(campos.estoque.value),
    vendeu_muito: campos.destaque.checked,
  }, { preview: true }))
}

function modoFormulario() {
  const editando = Boolean(estado.editandoId)
  $('#painel').classList.toggle('editando', editando)
  $('#painel-titulo').textContent = editando ? 'Editar produto' : 'Cadastrar produto'
  $('#painel-sub').textContent = editando
    ? 'Altere o que precisar e salve. A etiqueta ao lado mostra como vai ficar.'
    : 'Preencha os dados e veja a etiqueta ao vivo.'
  $('#btn-salvar .rot').textContent = editando ? 'Salvar alterações' : 'Cadastrar produto'
  $('#btn-cancelar').textContent = editando ? 'Cancelar edição' : 'Limpar'
}

function resetarForm() {
  const estavaEditando = Boolean(estado.editandoId)
  estado.editandoId = null
  $('#form-produto').reset()
  $('#p-erro').hidden = true
  modoFormulario()
  atualizarPreview()
  if (estavaEditando && estado.carregado) render()
}

function abrirProduto(produto) {
  estado.editandoId = produto._id
  campos.nome.value = produto.nome
  campos.preco.value = produto.preco
  campos.estoque.value = produto.estoque
  campos.cat.value = produto.categoria
  campos.destaque.checked = Boolean(produto.vendeu_muito)
  $('#p-erro').hidden = true
  $('#painel-corpo').hidden = false
  $('#btn-recolher').setAttribute('aria-expanded', 'true')
  $('#btn-recolher .rot').textContent = 'Recolher'
  modoFormulario()
  atualizarPreview()
  render()
  $('#painel').scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' })
  campos.nome.focus({ preventScroll: true })
}

for (const campo of Object.values(campos)) campo.addEventListener('input', atualizarPreview)
$('#btn-cancelar').addEventListener('click', resetarForm)
$$('[data-passo]').forEach((botao) => botao.addEventListener('click', () => {
  campos.estoque.value = Math.max(0, (Number(campos.estoque.value) || 0) + Number(botao.dataset.passo))
  atualizarPreview()
}))
$('#btn-recolher').addEventListener('click', () => {
  const corpo = $('#painel-corpo')
  corpo.hidden = !corpo.hidden
  $('#btn-recolher').setAttribute('aria-expanded', String(!corpo.hidden))
  $('#btn-recolher .rot').textContent = corpo.hidden ? 'Expandir' : 'Recolher'
})

$('#form-produto').addEventListener('submit', async (evento) => {
  evento.preventDefault()
  const botao = $('#btn-salvar')
  const editando = estado.editandoId
  // Se a categoria já existe com outra caixa ("informatica" x "Informática"), usa a que já existe.
  const digitada = campos.cat.value.trim()
  const existente = estado.produtos.find((p) => normalizar(p.categoria) === normalizar(digitada))
  const corpo = {
    nome: campos.nome.value.trim(),
    preco: Number(campos.preco.value),
    estoque: Number(campos.estoque.value),
    categoria: existente ? existente.categoria : digitada,
    vendeu_muito: campos.destaque.checked,
  }

  $('#p-erro').hidden = true
  ocupado(botao, true, editando ? 'Salvando' : 'Cadastrando')
  let salvo
  try {
    salvo = await api(editando ? `/produtos/${editando}` : '/produtos', {
      method: editando ? 'PUT' : 'POST',
      body: JSON.stringify(corpo),
    })
  } catch (erro) {
    $('#p-erro').textContent = erro.message
    $('#p-erro').hidden = false
    return
  } finally {
    ocupado(botao, false)
  }

  resetarForm()
  await carregar({ silencioso: true })
  if (editando) {
    toast(`“${salvo.nome}” foi atualizado.`)
    mostrarProduto(salvo._id)
  } else {
    toast(`“${salvo.nome}” cadastrado com sucesso!`, 'ok', { rotulo: 'Ver na lista', fn: () => mostrarProduto(salvo._id) })
    campos.nome.focus() // pronto para cadastrar o próximo
  }
})

// Excluir pede um segundo clique para confirmar (volta ao normal em 3 segundos).
function confirmarExclusao(botao, produto) {
  const rot = botao.querySelector('.rot')
  if (!botao.classList.contains('armado')) {
    botao.classList.add('armado')
    rot.textContent = 'Confirmar?'
    botao._timer = setTimeout(() => {
      botao.classList.remove('armado')
      rot.textContent = 'Excluir'
    }, 3000)
    return
  }
  clearTimeout(botao._timer)
  botao.disabled = true
  api(`/produtos/${produto._id}`, { method: 'DELETE' })
    .then(async () => {
      if (estado.editandoId === produto._id) resetarForm()
      await carregar({ silencioso: true })
      toast(`“${produto.nome}” foi excluído.`, 'info')
    })
    .catch((erro) => { botao.disabled = false; toast(erro.message, 'erro') })
}

// ---------- eventos gerais ----------
$$('[data-fechar]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()))
// Clicar fora da janela fecha.
dlgLogin.addEventListener('click', (e) => {
  if (e.target !== dlgLogin) return
  const r = dlgLogin.getBoundingClientRect()
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlgLogin.close()
})

for (const id of ['#busca', '#ordem']) $(id).addEventListener('input', () => render())
$('#btn-limpar').addEventListener('click', limparFiltros)
for (const [id, chave] of [['#st-destaque-btn', 'destaque'], ['#st-baixo-btn', 'baixo']]) {
  $(id).addEventListener('click', () => {
    estado.filtros[chave] = !estado.filtros[chave]
    render()
    $('.barra').scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' })
  })
}
$('#st-baixo-btn').title = `${ESTOQUE_BAIXO} unidades ou menos. Clique para filtrar.`
$('#st-destaque-btn').title = 'Clique para filtrar os que vendem muito.'

// "/" leva direto para a busca.
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
  if (document.querySelector('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return
  e.preventDefault()
  $('#busca').focus()
})

restaurarSessao()
atualizarConta()
carregar()
