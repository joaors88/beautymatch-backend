/**
 * Seed de demonstração — popula o BeautyMatch com uso simulado.
 *
 * NÃO é dado de produção.
 *
 * O que é genuíno: os termos canônicos e as categorias. As mensagens passam pelo
 * endpoint POST /chat de verdade, então quem produz o `canonicalTerm` é o
 * classificador real, não este script.
 *
 * O que é sintético: a distribuição no tempo. Tendência compara hoje com os últimos
 * 7 dias, e uma simulação acontece toda no mesmo instante — por isso as ocorrências
 * são replicadas ao longo da janela, com curva de crescimento. Também é sintético o
 * histórico de posições do autocomplete, pelo mesmo motivo (o Google só devolve o
 * ranking de agora, não o de ontem).
 *
 * Ao apresentar: "simulei uma semana de uso; as mensagens passaram pelo classificador
 * real e a distribuição no tempo foi comprimida".
 *
 *   node scripts/seed-demo.js          semeia
 *   node scripts/seed-demo.js --clean  remove o que foi semeado (mantém os usuários)
 *
 * Pré-requisitos: servidor no ar e ao menos uma coleta real (POST /trends/collect).
 */
require('dotenv/config')
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const API = process.env.DEMO_API_URL || 'http://localhost:3000'
const SENHA = 'demo123456'
const DIA = 24 * 60 * 60 * 1000
const DIAS = 6              // dias de histórico sintético
const CONCORRENCIA = 4

const USUARIOS = [
    { email: 'demo1@beautymatch.local', name: 'Ana Demo',
      profile: { skinType: 'OILY', hairType: 'CURLY', budget: 'MEDIUM', gender: 'FEMALE', ageRange: 'YOUNG_ADULT' } },
    { email: 'demo2@beautymatch.local', name: 'Bruno Demo',
      profile: { skinType: 'DRY', hairType: 'STRAIGHT', budget: 'LOW', gender: 'MALE', ageRange: 'ADULT' } },
    { email: 'demo3@beautymatch.local', name: 'Carla Demo',
      profile: { skinType: 'SENSITIVE', hairType: 'WAVY', budget: 'HIGH', gender: 'FEMALE', ageRange: 'MATURE', sensitiveSkin: true } },
    { email: 'demo4@beautymatch.local', name: 'Diego Demo',
      profile: { skinType: 'COMBINATION', hairType: 'COILY', budget: 'MEDIUM', gender: 'OTHER', ageRange: 'TEEN' } },
]

/**
 * Frases diferentes que devem convergir para o mesmo termo canônico.
 * `crescimento` marca os que sobem ao longo da semana (viram RISING no sinal interno).
 */
const ROTEIRO = [
    { crescimento: true,  frases: [
        'quero um shampoo pra cabelo oleoso',
        'me indica um shanpoo pra cabelo oleozo',
        'preciso de shampoo para cabelo oleoso',
        'qual shampoo é bom pra cabelo oleoso?',
        'to procurando shampoo pra cabelo oleoso barato' ] },
    { crescimento: true,  frases: [
        'me indica um protetor solar pra pele oleosa',
        'quero protetor solar pra pele oleosa',
        'qual protetor solar voce indica pra pele oleosa?',
        'protetor solar pra pele oleosa com toque seco',
        'preciso de protetor solar pele oleosa' ] },
    { crescimento: true,  frases: [
        'quero um sérum de vitamina c',
        'me indica serum de vitamina c',
        'onde compro sérum de vitamina C bom',
        'to querendo um serum vitamina c' ] },
    { crescimento: false, frases: [
        'me indica um hidratante facial',
        'quero um hidratante facial',
        'qual hidratante facial usar?',
        'preciso de hidratante facial' ] },
    { crescimento: false, frases: [
        'quero um batom vermelho',
        'me indica um batom vermelho',
        'onde acho batom vermelho' ] },
    { crescimento: false, frases: [
        'me indica uma máscara capilar',
        'quero uma mascara capilar boa',
        'preciso de máscara capilar' ] },
    { crescimento: false, frases: [
        'quero um perfume masculino amadeirado',
        'me indica um perfume masculino',
        'perfume masculino pra usar no trabalho' ] },
    { crescimento: false, frases: [
        'me indica um hidratante corporal pra pele seca',
        'quero hidratante corporal pele seca',
        'preciso de hidratante corporal' ] },
    { crescimento: false, frases: [
        'quero um corretivo pra olheiras',
        'me indica corretivo pra olheiras',
        'corretivo pra olheiras escuras' ] },
    { crescimento: false, frases: [
        'me indica uma base pra pele oleosa',
        'quero base pra pele oleosa' ] },
]

function capturaSintetica(diasAtras) {
    const d = new Date(Date.now() - diasAtras * DIA)
    d.setUTCHours(3, 0, 0, 0)
    return d
}

const timestampsSinteticos = () =>
    Array.from({ length: DIAS }, (_, i) => capturaSintetica(DIAS - i))

async function http(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(API + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const texto = await res.text()
    try { return { status: res.status, data: JSON.parse(texto) } }
    catch { return { status: res.status, data: texto } }
}

async function garantirUsuarios() {
    const criados = []

    for (const u of USUARIOS) {
        await http('/auth/register', { method: 'POST', body: { name: u.name, email: u.email, password: SENHA } })

        // premium: o limite free travaria a simulação em 5 perguntas
        await prisma.user.updateMany({ where: { email: u.email }, data: { plan: 'PREMIUM' } })

        const login = await http('/auth/login', { method: 'POST', body: { email: u.email, password: SENHA } })
        if (!login.data?.access_token) {
            console.error(`  falha no login de ${u.email}`, login.data)
            continue
        }

        await http('/profile', { method: 'POST', token: login.data.access_token, body: u.profile })
        criados.push({ ...u, token: login.data.access_token })
    }

    console.log(`Usuários prontos: ${criados.length}`)
    return criados
}

async function enviarMensagens(usuarios) {
    const tarefas = []
    let i = 0

    for (const grupo of ROTEIRO) {
        for (const frase of grupo.frases) {
            const user = usuarios[i % usuarios.length]
            tarefas.push({ frase, user })
            i++
        }
    }

    console.log(`Enviando ${tarefas.length} mensagens pelo POST /chat...`)
    let ok = 0

    for (let inicio = 0; inicio < tarefas.length; inicio += CONCORRENCIA) {
        const lote = tarefas.slice(inicio, inicio + CONCORRENCIA)
        const res = await Promise.all(lote.map((t) =>
            http('/chat', { method: 'POST', token: t.user.token, body: { message: t.frase } })
                .catch(() => ({ status: 0 }))))
        ok += res.filter((r) => r.status < 400).length
        process.stdout.write(`  ${Math.min(inicio + CONCORRENCIA, tarefas.length)}/${tarefas.length}\r`)
    }

    console.log(`\n  ${ok} mensagens processadas com sucesso`)
}

/**
 * As mensagens acabaram de ser enviadas, então caíram todas no mesmo instante.
 * Replica as ocorrências ao longo da janela para existir uma série temporal.
 */
async function distribuirNoTempo(usuarios) {
    const emails = usuarios.map((u) => u.email)
    const ids = (await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } }))
        .map((u) => u.id)

    const originais = await prisma.searchHistory.findMany({
        where: { userId: { in: ids }, canonicalTerm: { not: null }, category: { not: null } },
        select: { userId: true, query: true, canonicalTerm: true, category: true },
    })

    if (originais.length === 0) {
        console.log('Nenhum termo canônico foi gerado — nada a distribuir.')
        return
    }

    // termos que devem crescer, conforme marcado no roteiro
    const frasesQueCrescem = new Set(
        ROTEIRO.filter((g) => g.crescimento).flatMap((g) => g.frases))
    const termosQueCrescem = new Set(
        originais.filter((o) => frasesQueCrescem.has(o.query)).map((o) => o.canonicalTerm))

    const capturas = timestampsSinteticos()
    const reais = await prisma.trendSnapshot.findMany({
        where: { capturedAt: { gt: capturas[capturas.length - 1] } },
        distinct: ['capturedAt'], select: { capturedAt: true }, orderBy: { capturedAt: 'asc' },
    })
    const linhaDoTempo = [...capturas, ...reais.map((r) => r.capturedAt)]

    // um representante por termo, para não multiplicar as variações de frase
    const porTermo = new Map()
    for (const o of originais) if (!porTermo.has(o.canonicalTerm)) porTermo.set(o.canonicalTerm, o)

    const linhas = []

    linhaDoTempo.forEach((quando, indice) => {
        const progresso = (indice + 1) / linhaDoTempo.length

        for (const [termo, base] of porTermo) {
            // quem cresce vai de 3 a 14 ocorrências; o resto fica estável em ~5
            const quantidade = termosQueCrescem.has(termo)
                ? Math.round(3 + 11 * progresso)
                : 5

            for (let i = 0; i < quantidade; i++) {
                linhas.push({
                    userId: base.userId,
                    query: '[seed] ' + base.query,
                    intent: 'PRODUCT_SEARCH',
                    canonicalTerm: termo,
                    category: base.category,
                    createdAt: new Date(quando.getTime() - 60 * 1000 - i * 1000),
                })
            }
        }
    })

    await prisma.searchHistory.createMany({ data: linhas })
    console.log(`Distribuídas ${linhas.length} ocorrências de ${porTermo.size} termos em ${linhaDoTempo.length} períodos`)
    console.log(`  em alta: ${[...termosQueCrescem].join(', ')}`)
}

/** Histórico de posições do autocomplete, em cima dos termos realmente coletados. */
async function semearExterno() {
    const ultima = await prisma.trendSnapshot.findFirst({ orderBy: { capturedAt: 'desc' } })
    if (!ultima) {
        console.error('Nenhuma captura real. Rode POST /trends/collect antes.')
        return
    }

    const atuais = await prisma.trendSnapshot.findMany({
        where: { capturedAt: ultima.capturedAt },
        select: { term: true, category: true, position: true },
    })

    const ordenados = [...atuais].sort((a, b) => a.position - b.position)
    const sobem = new Set(ordenados.slice(0, 6).map((t) => t.term))
    const caem = new Set(ordenados.slice(-3).map((t) => t.term))

    const capturas = timestampsSinteticos()
    const linhas = []

    capturas.forEach((capturedAt, indice) => {
        const progresso = (indice + 1) / capturas.length

        for (const t of atuais) {
            let position

            if (sobem.has(t.term)) position = Math.round(10 - (10 - t.position) * progresso)
            else if (caem.has(t.term)) position = Math.round(1 + (t.position - 1) * progresso)
            else position = t.position + (((t.term.length + indice) % 3) - 1)

            linhas.push({
                term: t.term, category: t.category, source: 'AUTOCOMPLETE',
                position: Math.max(1, Math.min(10, position)), capturedAt,
            })
        }
    })

    await prisma.trendSnapshot.createMany({ data: linhas })
    console.log(`Semeados ${linhas.length} snapshots de posição em ${capturas.length} capturas`)
}

async function limpar() {
    const snaps = await prisma.trendSnapshot.deleteMany({
        where: { capturedAt: { in: timestampsSinteticos() } },
    })

    const ids = (await prisma.user.findMany({
        where: { email: { in: USUARIOS.map((u) => u.email) } }, select: { id: true },
    })).map((u) => u.id)

    const buscas = await prisma.searchHistory.deleteMany({ where: { userId: { in: ids } } })

    console.log(`Removidos ${snaps.count} snapshots sintéticos e ${buscas.count} buscas de demo.`)
    console.log(`Usuários de demo mantidos. Restam ${await prisma.trendSnapshot.count()} snapshots reais.`)
}

async function main() {
    if (process.argv.includes('--clean')) {
        await limpar()
    } else {
        const usuarios = await garantirUsuarios()
        if (usuarios.length === 0) throw new Error('Nenhum usuário de demo disponível')

        await enviarMensagens(usuarios)
        await distribuirNoTempo(usuarios)
        await semearExterno()

        console.log('\nAgora rode POST /trends/calculate para materializar os scores.')
    }

    await prisma.$disconnect()
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
