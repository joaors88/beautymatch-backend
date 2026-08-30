import { Injectable, Logger } from '@nestjs/common'
import { ProductCategory, TrendSource } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { searchClient } from '../search/search.client'
import { AiClient, TrendCandidate } from '../ai/ai.client'
import { normalizeCategory, normalizeTrendTerm } from 'src/common/canonical-term'
import { TREND_PREFIXES } from './trend-prefixes'

export interface CollectResult {
    capturedAt: Date
    prefixesOk: number
    prefixesFail: number
    suggestions: number
    saved: number
    usedAi: boolean
}

/**
 * Coleta o sinal externo de tendência: o autocomplete do Google via Serper.
 *
 * É a única parte do fluxo de tendências que toca a rede, e roda sempre fora do
 * request do usuário. Se o provider cair, o trending continua servindo o último
 * cálculo em vez de propagar o erro.
 */
@Injectable()
export class TrendsCollectorService {
    private readonly logger = new Logger(TrendsCollectorService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly searchClient: searchClient,
        private readonly aiClient: AiClient,
    ) {}

    // O agendamento NÃO mora aqui: quem dispara a rotina diária é o TrendsScheduler,
    // que roda coleta e depois cálculo na ordem certa. Um @Cron neste serviço faria a
    // coleta rodar duas vezes por dia — dobrando a cota do Serper e, pior, criando duas
    // capturas com segundos de diferença, que o cálculo trataria como dois pontos
    // distintos da série temporal.
    async collect(): Promise<CollectResult> {
        // um único instante para toda a rodada: a janela de 7 dias agrupa por captura
        const capturedAt = new Date()

        const candidates: (TrendCandidate & { position: number })[] = []
        let prefixesOk = 0
        let prefixesFail = 0

        for (const [category, prefixes] of Object.entries(TREND_PREFIXES)) {
            for (const prefix of prefixes) {
                try {
                    const suggestions = await this.searchClient.searchAutocomplete(prefix)

                    suggestions.forEach((text, index) => {
                        candidates.push({
                            id: candidates.length,
                            text,
                            categoryFromPrefix: category,
                            position: index + 1,
                        })
                    })

                    prefixesOk++
                } catch (error) {
                    prefixesFail++
                    this.logger.error(`Falha no autocomplete do prefixo "${prefix}"`, error)
                }
            }
        }

        if (candidates.length === 0) {
            this.logger.warn('Nenhuma sugestão coletada — nada a salvar')
            return { capturedAt, prefixesOk, prefixesFail, suggestions: 0, saved: 0, usedAi: false }
        }

        let canonized: { id: number; termo: string | null; categoria: string | null }[]
        let usedAi = true

        try {
            canonized = await this.aiClient.canonizeTrendTerms(candidates)
        } catch (error) {
            usedAi = false
            this.logger.error('Canonização pela IA falhou — seguindo só com normalização determinística', error)
            canonized = candidates.map((c) => ({
                id: c.id,
                termo: c.text,
                categoria: c.categoryFromPrefix,
            }))
        }

        const best = new Map<string, {
            term: string
            category: ProductCategory
            source: TrendSource
            position: number
            capturedAt: Date
        }>()

        for (const item of canonized) {
            const origem = candidates.find((c) => c.id === item.id)
            if (!origem) continue

            const term = normalizeTrendTerm(item.termo)
            const category = normalizeCategory(item.categoria)
            if (!term || !category) continue

            const key = `${term}|${category}`
            const atual = best.get(key)

            if (!atual || origem.position < atual.position) {
                best.set(key, {
                    term,
                    category,
                    source: TrendSource.AUTOCOMPLETE,
                    position: origem.position,
                    capturedAt,
                })
            }
        }

        const rows = [...best.values()]

        if (rows.length > 0) {
            await this.prisma.trendSnapshot.createMany({ data: rows })
        }

        return {
            capturedAt,
            prefixesOk,
            prefixesFail,
            suggestions: candidates.length,
            saved: rows.length,
            usedAi,
        }
    }
}
