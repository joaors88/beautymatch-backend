import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ProductCategory, TrendDirection } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface CalculateResult {
    computedAt: Date
    captures: number
    terms: number
    rising: number
    stable: number
    falling: number
    internalVolume: number
    internalWeight: number
    externalWeight: number
}

interface TermSeries {
    term: string
    category: ProductCategory
    /** score externo (posição no autocomplete) por captura */
    external: Map<number, number>
    /** score interno (frequência relativa de busca) por captura */
    internal: Map<number, number>
    /** em quantas capturas o termo apareceu em pelo menos um dos sinais */
    presence: Set<number>
}

/**
 * Transforma os snapshots brutos e o histórico de buscas em TrendScore materializado.
 *
 * Não toca a rede e não depende do coletor: lê do banco e escreve no banco. É a
 * parte testável de verdade do fluxo de tendências.
 */
@Injectable()
export class TrendsCalculatorService {
    private readonly logger = new Logger(TrendsCalculatorService.name)

    private readonly windowDays: number
    private readonly risingThreshold: number
    private readonly minCaptures: number
    private readonly minScoreForDirection: number
    private readonly minInternalCount: number
    private readonly internalReferenceCount: number
    private readonly internalFullVolume: number
    private readonly internalMaxWeight: number

    /** o autocomplete devolve no máximo 10 sugestões */
    private readonly maxPosition = 10

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
    ) {
        this.windowDays = Number(this.config.get('TRENDS_WINDOW_DAYS') ?? 7)
        this.risingThreshold = Number(this.config.get('TRENDS_RISING_THRESHOLD') ?? 1.3)
        this.minCaptures = Number(this.config.get('TRENDS_MIN_CAPTURES') ?? 3)
        this.minScoreForDirection = Number(this.config.get('TRENDS_MIN_SCORE_FOR_DIRECTION') ?? 0.5)
        this.minInternalCount = Number(this.config.get('TRENDS_MIN_INTERNAL_COUNT') ?? 3)
        this.internalReferenceCount = Number(this.config.get('TRENDS_INTERNAL_REFERENCE_COUNT') ?? 20)
        this.internalFullVolume = Number(this.config.get('TRENDS_INTERNAL_FULL_VOLUME') ?? 500)
        this.internalMaxWeight = Number(this.config.get('TRENDS_INTERNAL_MAX_WEIGHT') ?? 0.7)
    }

    /**
     * Posição do autocomplete vira score invertido numa escala 0–1:
     * posição 1 vale 1.0, posição 10 vale 0.1.
     */
    positionToScore(position: number): number {
        if (!Number.isFinite(position) || position < 1) return 0

        const score = (this.maxPosition - position + 1) / this.maxPosition

        return Math.max(0, Math.min(1, score))
    }

    /**
     * O peso do sinal interno cresce com o volume acumulado, em rampa linear até um
     * teto. Rampa e não degrau para o ranking não dar solavanco no dia em que o
     * volume cruza o limiar. Os dois pesos somam 1, para que o score continue
     * comparável entre dias diferentes.
     */
    internalWeightFor(volume: number): number {
        if (!Number.isFinite(volume) || volume <= 0) return 0

        const ramp = volume / this.internalFullVolume

        return Math.max(0, Math.min(this.internalMaxWeight, ramp))
    }

    async calculate(): Promise<CalculateResult> {
        const since = new Date(Date.now() - this.windowDays * 24 * 60 * 60 * 1000)
        const computedAt = new Date()

        const [snapshots, searches] = await Promise.all([
            this.prisma.trendSnapshot.findMany({
                where: { capturedAt: { gte: since } },
                orderBy: { capturedAt: 'asc' },
            }),
            this.prisma.searchHistory.findMany({
                where: {
                    createdAt: { gte: since },
                    canonicalTerm: { not: null },
                    category: { not: null },
                },
                select: { canonicalTerm: true, category: true, createdAt: true },
            }),
        ])

        if (snapshots.length === 0) {
            this.logger.warn('Nenhum snapshot na janela — nada a calcular')
            return {
                computedAt, captures: 0, terms: 0, rising: 0, stable: 0, falling: 0,
                internalVolume: searches.length, internalWeight: 0, externalWeight: 1,
            }
        }

        const captureTimes = [...new Set(snapshots.map((s) => s.capturedAt.getTime()))].sort(
            (a, b) => a - b,
        )
        const latestCapture = captureTimes[captureTimes.length - 1]
        const priorCaptures = captureTimes.filter((t) => t !== latestCapture)

        // pesos da rodada: dependem do volume interno acumulado na janela
        const internalWeight = this.internalWeightFor(searches.length)
        const externalWeight = 1 - internalWeight

        const series = new Map<string, TermSeries>()

        const pegar = (term: string, category: ProductCategory): TermSeries => {
            const key = `${term}|${category}`
            let entry = series.get(key)

            if (!entry) {
                entry = { term, category, external: new Map(), internal: new Map(), presence: new Set() }
                series.set(key, entry)
            }

            return entry
        }

        // ---- sinal externo: melhor posição do termo em cada captura
        for (const snap of snapshots) {
            const entry = pegar(snap.term, snap.category)
            const at = snap.capturedAt.getTime()
            const score = this.positionToScore(snap.position)
            const previous = entry.external.get(at)

            if (previous === undefined || score > previous) {
                entry.external.set(at, score)
            }

            entry.presence.add(at)
        }

        // ---- sinal interno: buscas reais, contadas no período que cada captura fecha
        const umDia = 24 * 60 * 60 * 1000

        captureTimes.forEach((at, index) => {
            const inicio = index > 0 ? captureTimes[index - 1] : at - umDia

            const contagem = new Map<string, { term: string; category: ProductCategory; n: number }>()

            for (const s of searches) {
                const quando = s.createdAt.getTime()
                if (quando <= inicio || quando > at) continue

                const term = s.canonicalTerm as string
                const category = s.category as ProductCategory
                const key = `${term}|${category}`
                const atual = contagem.get(key)

                if (atual) atual.n++
                else contagem.set(key, { term, category, n: 1 })
            }

            // piso de ruído: abaixo do mínimo, o termo não conta no período
            const validos = [...contagem.values()].filter((c) => c.n >= this.minInternalCount)
            if (validos.length === 0) return

            // Escala contra uma referência fixa, não contra o maior do período.
            // Normalizar pelo maior mediria posição relativa, não crescimento: se um
            // termo salta de 3 para 300 buscas, ele já era o topo e continuaria valendo
            // 1.0 — quem "se moveria" seriam os outros, caindo. Com referência fixa o
            // salto vira 0.15 -> 1.0 e o RISING dispara em quem de fato cresceu.
            for (const c of validos) {
                const entry = pegar(c.term, c.category)
                entry.internal.set(at, Math.min(1, c.n / this.internalReferenceCount))
                entry.presence.add(at)
            }
        })

        const rows: {
            term: string
            category: ProductCategory
            score: number
            delta: number
            direction: TrendDirection
            internalWeight: number
            externalWeight: number
            computedAt: Date
        }[] = []

        const combinar = (entry: TermSeries, at: number): number =>
            (entry.external.get(at) ?? 0) * externalWeight +
            (entry.internal.get(at) ?? 0) * internalWeight

        for (const entry of series.values()) {
            const current = combinar(entry, latestCapture)

            // ausência conta como zero: termo que passou a aparecer está subindo
            const baseline = priorCaptures.length
                ? priorCaptures.reduce((sum, t) => sum + combinar(entry, t), 0) / priorCaptures.length
                : 0

            let direction: TrendDirection = TrendDirection.STABLE

            // Piso absoluto: a direção é uma razão, e razão amplifica movimento onde o
            // score é pequeno. Sem este piso, sair da posição 9 para a 8 vira +50% e
            // qualifica como alta, enquanto ir da 2 para a 1 (bem mais relevante) dá
            // só +11% e não qualifica. Só termos com relevância mínima ganham direção.
            //
            // Medido sobre o sinal BRUTO, não sobre o score ponderado: como os pesos
            // somam 1, um termo sem sinal interno tem score no máximo igual ao peso
            // externo, e passaria a ser barrado pelo piso conforme o peso migra — o
            // limiar deixaria de significar relevância e viraria função dos pesos.
            const forca = (at: number) =>
                Math.max(entry.external.get(at) ?? 0, entry.internal.get(at) ?? 0)

            const forcaMaxima = Math.max(
                forca(latestCapture),
                ...priorCaptures.map((t) => forca(t)),
                0,
            )

            const relevante = forcaMaxima >= this.minScoreForDirection

            // 1 = não se mediu movimento (sem base para comparar)
            let delta = 1

            // sem histórico suficiente não se afirma crescimento
            if (relevante && entry.presence.size >= this.minCaptures && baseline > 0) {
                delta = current / baseline

                if (delta >= this.risingThreshold) {
                    direction = TrendDirection.RISING
                } else if (delta <= 1 / this.risingThreshold) {
                    direction = TrendDirection.FALLING
                }
            }

            rows.push({
                term: entry.term,
                category: entry.category,
                score: current,
                delta,
                direction,
                internalWeight,
                externalWeight,
                computedAt,
            })
        }

        // append em vez de replace: mantém o cálculo auditável e a leitura pega o
        // computedAt mais recente
        await this.prisma.trendScore.createMany({ data: rows })

        const contar = (d: TrendDirection) => rows.filter((r) => r.direction === d).length

        return {
            computedAt,
            captures: captureTimes.length,
            terms: rows.length,
            rising: contar(TrendDirection.RISING),
            stable: contar(TrendDirection.STABLE),
            falling: contar(TrendDirection.FALLING),
            internalVolume: searches.length,
            internalWeight,
            externalWeight,
        }
    }
}
