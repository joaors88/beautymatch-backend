import axios from 'axios'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UserProfile } from '@prisma/client'
import { CLASSIFY_INTENT_PROMPT } from './prompts/classify-intent.prompt'
import { EDUCATION_PROMPT } from './prompts/education.prompt'
import { RECOMMENDATION_PROMPT } from './prompts/recomendation.prompt'
import { PRODUCT_COMPARISON_PROMPT } from './prompts/comparison.prompt'
import { SEARCH_QUERY_PROMPT } from './prompts/search.query.prompt'
import { SEARCH_COMMENT_PROMPT } from './prompts/search-comment.prompt'
import { CANONIZE_TRENDS_PROMPT } from './prompts/canonize-trends.prompt'

export interface ChatMessage {
    role: string
    content: string
}

export interface TrendCandidate {
    id: number
    text: string
    categoryFromPrefix: string
}

export interface CanonizedTrend {
    id: number
    termo: string | null
    categoria: string | null
}

export interface ClassifyIntentResult {
    intent: string
    canonicalTerm: string | null
    category: string | null
}

@Injectable()
export class AiClient {
    private apiKey: string
    private model: string

    constructor(private readonly config: ConfigService) {
        this.apiKey = this.config.getOrThrow<string>('OPENROUTER_API_KEY')
        this.model = this.config.getOrThrow<string>('OPENROUTER_MODEL')
    }

    private async callOpenRouter(
        messages: ChatMessage[],
        temperature: number,
    ): Promise<string> {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            { model: this.model, messages, temperature },
            {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'BeautyMatch',
                },
            },
        )
        return response.data.choices[0].message.content
    }

    private buildProfileText(profile: UserProfile | null): string {
        if (!profile) {
            return 'O usuário ainda não preencheu o perfil.'
        }

        return `Perfil do usuário:
- Tipo de pele: ${profile.skinType ?? 'não informado'}
- Tipo de cabelo: ${profile.hairType ?? 'não informado'}
- Orçamento: ${profile.budget ?? 'não informado'}
- Faixa etária: ${profile.ageRange ?? 'não informado'}
- Gênero: ${profile.gender ?? 'não informado'}
- Pele sensível: ${profile.sensitiveSkin ? 'sim' : 'não'}
- Apenas vegano: ${profile.veganOnly ? 'sim' : 'não'}`
    }

    async classifyIntent(message: string, history: ChatMessage[] = []): Promise<ClassifyIntentResult> {
        const content = await this.callOpenRouter(
            [
                { role: 'system', content: CLASSIFY_INTENT_PROMPT },
                ...history,
                { role: 'user', content: message },
            ],
            0,
        )

        const clean = content.replace(/```json/g, '').replace(/```/g, '').trim()
        return JSON.parse(clean)
    }

    async generateEducation(message: string, history: ChatMessage[] = []): Promise<string> {
        const content = await this.callOpenRouter(
            [
                { role: 'system', content: EDUCATION_PROMPT },
                ...history,
                { role: 'user', content: message },
            ],
            0.7,
        )
        return content.trim()
    }

    /**
     * Quem decide o que está em alta é o backend; a IA só recebe os termos como
     * informação de contexto, no mesmo padrão do perfil.
     */
    private buildTrendingText(terms: string[]): string {
        if (terms.length === 0) {
            return 'Não há termos em alta para citar agora.'
        }

        return `Termos de beleza em alta no momento: ${terms.join(', ')}.`
    }

    async generateRecommendation(
        message: string,
        profile: UserProfile | null,
        history: ChatMessage[] = [],
        trendingTerms: string[] = [],
    ): Promise<string> {
        const content = await this.callOpenRouter(
            [
                { role: 'system', content: RECOMMENDATION_PROMPT },
                { role: 'system', content: this.buildProfileText(profile) },
                { role: 'system', content: this.buildTrendingText(trendingTerms) },
                ...history,
                { role: 'user', content: message },
            ],
            0.7,
        )
        return content.trim()
    }

    async generationComparison(
        message: string,
        profile: UserProfile | null,
        history: ChatMessage[] = [],
    ): Promise<string> {
        const content = await this.callOpenRouter(
            [
                { role: 'system', content: PRODUCT_COMPARISON_PROMPT },
                { role: 'system', content: this.buildProfileText(profile) },
                ...history,
                { role: 'user', content: message },
            ],
            0.7,
        )
        return content.trim()
    }

    async extractSearchQuery(
        message: string,
        profile: UserProfile | null,
        history: ChatMessage[] = [],
    ): Promise<string> {
        const content = await this.callOpenRouter(
            [
                { role: 'system', content: SEARCH_QUERY_PROMPT },
                { role: 'system', content: this.buildProfileText(profile) },
                ...history,
                { role: 'user', content: message },
            ],
            0,
        )
        return content.trim()
    }

    async commentProducts(
        message: string,
        products: { title: string; price: string; source: string }[],
        profile: UserProfile | null,
    ): Promise<string> {
        const list = products
            .map((p, i) => `${i + 1}. ${p.title} — ${p.price} (${p.source})`)
            .join('\n')

        const content = await this.callOpenRouter(
            [
                { role: 'system', content: SEARCH_COMMENT_PROMPT },
                { role: 'system', content: this.buildProfileText(profile) },
                { role: 'system', content: `Produtos encontrados:\n${list}` },
                { role: 'user', content: message },
            ],
            0.7,
        )
        return content.trim()
    }

    /**
     * Canoniza em UMA chamada todas as sugestões coletadas do autocomplete.
     * Roda no cron diário, fora do caminho do usuário — por isso o uso de LLM aqui
     * não conflita com a restrição do fingerprint de produto, que é síncrono e
     * precisa ser determinístico.
     */
    async canonizeTrendTerms(candidates: TrendCandidate[]): Promise<CanonizedTrend[]> {
        if (candidates.length === 0) return []

        const payload = candidates.map((c) => ({
            id: c.id,
            texto: c.text,
            categoria_origem: c.categoryFromPrefix,
        }))

        const content = await this.callOpenRouter(
            [
                { role: 'system', content: CANONIZE_TRENDS_PROMPT },
                { role: 'user', content: JSON.stringify(payload) },
            ],
            0,
        )

        const clean = content.replace(/```json/g, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(clean)

        return Array.isArray(parsed) ? parsed : []
    }
}
