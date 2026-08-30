import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ProductCategory, TrendDirection } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface TrendItem {
    term: string
    category: ProductCategory
    score: number
    /** quanto o termo cresceu em relação à própria média: 1.5 = subiu 50% */
    delta: number
    direction: TrendDirection
}

export interface TrendsResponse {
    /** de onde veio a lista: termos em ascensão ou queda para popularidade */
    source: 'RISING' | 'POPULAR'
    computedAt: Date | null
    items: TrendItem[]
}

/**
 * Interface pública das tendências. Lê apenas de TrendScore — nunca chama o Serper
 * nem recalcula nada dentro do request, então a latência é previsível e uma queda
 * do provider não afeta a leitura.
 */
@Injectable()
export class TrendsService {
    private readonly defaultLimit: number
    private readonly minRising: number

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
    ) {
        this.defaultLimit = Number(this.config.get('TRENDS_DEFAULT_LIMIT') ?? 10)
        this.minRising = Number(this.config.get('TRENDS_MIN_RISING') ?? 3)
    }

    /** O cálculo é gravado em append; a leitura sempre usa o lote mais recente. */
    private async latestComputedAt(): Promise<Date | null> {
        const ultimo = await this.prisma.trendScore.findFirst({
            orderBy: { computedAt: 'desc' },
            select: { computedAt: true },
        })

        return ultimo?.computedAt ?? null
    }

    /**
     * Ordena por delta, não por score.
     *
     * A posição no autocomplete é um ranking DENTRO do prefixo consultado: cada um dos
     * prefixos devolve a própria lista de 1 a 10, então dezenas de termos empatam em
     * "primeiro lugar" e o score absoluto não compara termos entre si. O que a posição
     * mede bem é o termo contra ele mesmo ao longo do tempo — que é exatamente o delta.
     * E "em alta" deve mesmo mostrar quem mais subiu, não quem tem o número maior.
     */
    async getRising(category?: ProductCategory, limit?: number): Promise<TrendItem[]> {
        const computedAt = await this.latestComputedAt()
        if (!computedAt) return []

        return this.prisma.trendScore.findMany({
            where: {
                computedAt,
                direction: TrendDirection.RISING,
                ...(category ? { category } : {}),
            },
            orderBy: [{ delta: 'desc' }, { score: 'desc' }],
            take: limit ?? this.defaultLimit,
            select: { term: true, category: true, score: true, delta: true, direction: true },
        })
    }

    async getPopular(category?: ProductCategory, limit?: number): Promise<TrendItem[]> {
        const computedAt = await this.latestComputedAt()
        if (!computedAt) return []

        return this.prisma.trendScore.findMany({
            where: {
                computedAt,
                ...(category ? { category } : {}),
            },
            orderBy: { score: 'desc' },
            take: limit ?? this.defaultLimit,
            select: { term: true, category: true, score: true, delta: true, direction: true },
        })
    }

    /**
     * O que a tela consome. Sem termos em ascensão suficientes numa categoria, cai
     * para popularidade em vez de mostrar uma lista vazia ou curta. O campo `source`
     * e o `direction` de cada item deixam o front diferenciar visualmente os dois casos.
     */
    async getTrends(category?: ProductCategory, limit?: number): Promise<TrendsResponse> {
        const computedAt = await this.latestComputedAt()
        if (!computedAt) {
            return { source: 'POPULAR', computedAt: null, items: [] }
        }

        const rising = await this.getRising(category, limit)

        if (rising.length >= this.minRising) {
            return { source: 'RISING', computedAt, items: rising }
        }

        return { source: 'POPULAR', computedAt, items: await this.getPopular(category, limit) }
    }
}
