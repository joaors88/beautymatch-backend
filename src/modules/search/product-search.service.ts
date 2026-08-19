import { Injectable, Logger } from '@nestjs/common'
import { UserProfile } from '@prisma/client'
import { searchClient } from './search.client'
import { AiClient, ChatMessage } from '../ai/ai.client'

export interface Product {
    title: string
    price: string
    priceValue: number
    source: string
    link: string
    imageUrl: string
}

@Injectable()
export class ProductSearchService {
    private readonly logger = new Logger(ProductSearchService.name)

    constructor(
        private readonly searchClient: searchClient,
        private readonly aiClient: AiClient,
    ) {}

    async search(
        message: string,
        profile: UserProfile | null,
        history: ChatMessage[] = [],
    ): Promise<{ query: string; reply: string; products: Product[] }> {
        const query = await this.aiClient.extractSearchQuery(message, profile, history)

        let raw: any[] = []
        try {
            raw = await this.searchClient.searchShopping(query)
        } catch (error) {
            this.logger.error('Erro na busca da Serper', error)
            return {
                query,
                reply: 'Não consegui buscar produtos agora. Tente novamente em instantes.',
                products: [],
            }
        }

        const products: Product[] = raw
            .map((item) => ({
                title: item.title,
                price: item.price,
                priceValue: this.parsePrice(item.price),
                source: item.source,
                link: item.link,
                imageUrl: item.imageUrl,
            }))
            .filter((p): p is Product => p.priceValue !== null)

        products.sort((a, b) => a.priceValue - b.priceValue)
        const top5 = products.slice(0, 5)

        if (top5.length === 0) {
            return {
                query,
                reply: 'Não encontrei produtos para essa busca. Pode descrever de outro jeito?',
                products: [],
            }
        }

        // a IA comenta os resultados; se falhar, cai numa mensagem padrão
        let reply = 'Encontrei estas opções pra você, do menor preço ao maior:'
        try {
            reply = await this.aiClient.commentProducts(message, top5, profile)
        } catch (error) {
            this.logger.error('Erro ao comentar produtos', error)
        }

        return { query, reply, products: top5 }
    }

    private parsePrice(price?: string): number | null {
        if (!price) return null

        const cleaned = price
            .replace('R$', '')
            .replace(/\./g, '')
            .replace(',', '.')
            .trim()

        const value = parseFloat(cleaned)
        return isNaN(value) ? null : value
    }
}