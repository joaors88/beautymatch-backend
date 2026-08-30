/**
 * Verificação pendente do §9 do spec de tendências:
 *
 *   "olhar o payload cru do Serper Shopping e checar se vem algum productId do Google.
 *    Se vier e for estável, usar como chave primária e o fingerprint vira fallback."
 *
 * O productId VEM. O que falta saber é se ele é estável ao longo do tempo — se o mesmo
 * produto mantém o mesmo id amanhã. Se mantiver, a normalização de produtos dispensa a
 * lista de marcas, a regex de volume e o algoritmo de fingerprint.
 *
 *   node scripts/probe-product-id.js         coleta e guarda uma rodada
 *   node scripts/probe-product-id.js --diff  compara as duas rodadas mais recentes
 *
 * Rode hoje, rode de novo amanhã, depois compare.
 */
require('dotenv/config')
const fs = require('fs')
const path = require('path')

const ARQUIVO = path.join(__dirname, '.productid-probe.json')

const CONSULTAS = [
    'shampoo anticaspa',
    'protetor solar facial',
    'serum vitamina c',
]

async function buscar(q) {
    const res = await fetch('https://google.serper.dev/shopping', {
        method: 'POST',
        headers: {
            'X-API-KEY': process.env.SERPER_DEV_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q, gl: 'br', hl: 'pt-br' }),
    })

    const data = await res.json()

    return (data.shopping ?? []).map((s) => ({
        productId: s.productId ?? null,
        title: s.title ?? null,
        price: s.price ?? null,
        source: s.source ?? null,
        position: s.position ?? null,
    }))
}

function carregar() {
    if (!fs.existsSync(ARQUIVO)) return []
    return JSON.parse(fs.readFileSync(ARQUIVO, 'utf-8'))
}

async function coletar() {
    const rodada = { quando: new Date().toISOString(), consultas: {} }

    for (const q of CONSULTAS) {
        rodada.consultas[q] = await buscar(q)
        const itens = rodada.consultas[q]
        const comId = itens.filter((i) => i.productId).length
        console.log(`  "${q}": ${itens.length} resultados, ${comId} com productId`)
    }

    const historico = carregar()
    historico.push(rodada)
    fs.writeFileSync(ARQUIVO, JSON.stringify(historico, null, 2))

    console.log(`\nRodada salva (${historico.length} no total) em ${ARQUIVO}`)
    if (historico.length < 2) {
        console.log('Rode de novo amanhã e depois use --diff para comparar.')
    }
}

function comparar() {
    const historico = carregar()

    if (historico.length < 2) {
        console.error('Preciso de pelo menos 2 rodadas. Rode o script sem --diff hoje e amanhã.')
        return
    }

    const anterior = historico[historico.length - 2]
    const atual = historico[historico.length - 1]

    const horas = (new Date(atual.quando) - new Date(anterior.quando)) / 3600000
    console.log(`Comparando rodadas separadas por ${horas.toFixed(1)}h\n`)

    let totalAntes = 0, aindaPresentes = 0, tituloIgual = 0, tituloMudou = 0, precoMudou = 0

    for (const q of CONSULTAS) {
        const antes = anterior.consultas[q] ?? []
        const agora = atual.consultas[q] ?? []
        const mapaAgora = new Map(agora.filter((i) => i.productId).map((i) => [i.productId, i]))

        let presentes = 0
        for (const item of antes) {
            if (!item.productId) continue
            totalAntes++

            const igual = mapaAgora.get(item.productId)
            if (!igual) continue

            presentes++
            aindaPresentes++
            if (igual.title === item.title) tituloIgual++
            else {
                tituloMudou++
                console.log(`  título mudou para o mesmo id ${item.productId}:`)
                console.log(`     antes: ${item.title}`)
                console.log(`     agora: ${igual.title}`)
            }
            if (igual.price !== item.price) precoMudou++
        }

        console.log(`  "${q}": ${presentes}/${antes.filter((i) => i.productId).length} ids reapareceram`)
    }

    const pct = totalAntes ? Math.round((100 * aindaPresentes) / totalAntes) : 0

    console.log(`\n=== RESULTADO ===`)
    console.log(`ids que reapareceram   : ${aindaPresentes}/${totalAntes} (${pct}%)`)
    console.log(`mesmo id, mesmo título : ${tituloIgual}`)
    console.log(`mesmo id, título mudou : ${tituloMudou}   <- se for alto, o id não identifica o produto`)
    console.log(`mesmo id, preço mudou  : ${precoMudou}   <- normal e desejável`)
    console.log()

    if (pct >= 70 && tituloMudou === 0) {
        console.log('VEREDITO: id estável. Use como chave primária; fingerprint vira fallback.')
    } else if (pct >= 40) {
        console.log('VEREDITO: id parcialmente estável. Serve como chave quando presente,')
        console.log('mas o fingerprint continua necessário para a parcela que se perde.')
    } else {
        console.log('VEREDITO: id instável. Implementar o fingerprint determinístico do §9.')
    }
}

async function main() {
    if (!process.env.SERPER_DEV_KEY) throw new Error('SERPER_DEV_KEY ausente no .env')

    if (process.argv.includes('--diff')) comparar()
    else await coletar()
}

main().catch((e) => { console.error(e); process.exit(1) })
