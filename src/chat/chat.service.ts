import { Injectable, ForbiddenException } from '@nestjs/common'
import { UsageService } from '../usage/usage.service'
import { PrismaService } from 'src/modules/prisma/prisma.service'
import { AiClient } from 'src/modules/ai/ai.client'
import { Product, ProductSearchService } from 'src/modules/search/product-search.service'
import { normalizeCanonicalTerm, normalizeCategory, normalizeIntent } from 'src/common/canonical-term'
import { ProductCategory } from '@prisma/client'
import { Intent } from 'src/modules/ai/enums/intent.enums'
import { TrendsService } from 'src/modules/trends/trends.service'

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usageService: UsageService,
    private readonly aiClient: AiClient,
    private readonly productSearchService: ProductSearchService,
    private readonly trendsService: TrendsService,
  ) {}

  async handleMessage(userId: string, message: string) {
    // 1. validar plano e limite
    const canUse = await this.usageService.canUseChat(userId)

    if (!canUse) {
      throw new ForbiddenException(
        'Limite de perguntas atingido. Faça upgrade para continuar.',
      )
    }

    // 2. buscar usuário com perfil
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    })

    if (!user) {
      throw new ForbiddenException('Usuário não encontrado')
    }

    // 3. buscar histórico recente
    const history = await this.prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    // montar os turnos de conversa (do mais antigo pro mais novo), só os que têm resposta
    const historyMessages = [...history]
      .reverse()
      .filter((h) => h.reply)
      .flatMap((h) => [
        { role: 'user', content: h.query },
        { role: 'assistant', content: h.reply as string },
      ])

      let intent: Intent = Intent.OUT_OF_SCOPE
      let canonicalTerm: string | null = null
      let category: ProductCategory | null = null

      try {
        const result = await this.aiClient.classifyIntent(message, historyMessages)

        intent = normalizeIntent(result?.intent)

        if (intent === Intent.PRODUCT_SEARCH || intent === Intent.RECOMMENDATION) {
          canonicalTerm = normalizeCanonicalTerm(result?.canonicalTerm)
          category = normalizeCategory(result?.category)
        }
      } catch (error) {
        console.error('AI error:', error)
        intent = Intent.OUT_OF_SCOPE
      }

    let reply: string

    let products: Product[] = []

    // termos em alta devolvidos como dado, para o front renderizar como sugestões
    // clicáveis — o clique reaproveita o fluxo de PRODUCT_SEARCH
    let trending: string[] = []

    switch (intent) {
      case Intent.OUT_OF_SCOPE:
        reply = 'Desculpe, só posso ajudar com assuntos de beleza - skincare, maquiagem, cabelo, perfumaria e cuidados pessoais.'
          break

      case Intent.EDUCATION:
        reply = await this.aiClient.generateEducation(message, historyMessages)
          break

      case Intent.RECOMMENDATION: {
        // se a leitura falhar, a recomendação continua normalmente sem os termos
        try {
          const rising = await this.trendsService.getRising(category ?? undefined, 5)
          trending = rising.map((t) => t.term)
        } catch (error) {
          console.error('Trends error:', error)
        }

        // os termos vão também para a IA: quando ela encaixa um na resposta o texto
        // fica mais natural, mas isso é bônus — a entrega garantida é o campo trending
        reply = await this.aiClient.generateRecommendation(
          message,
          user.profile,
          historyMessages,
          trending,
        )
        break
      }

      case Intent.PRODUCT_COMPARISON:
        reply = await this.aiClient.generationComparison(message, user.profile, historyMessages)
          break

      case Intent.PRODUCT_SEARCH: {
        const result = await this.productSearchService.search(message, user.profile, historyMessages)
        reply = result.reply
        products = result.products
        break
      }

    default:
      reply = 'Entendi sua intenção, mas ainda estou aprendendo a responder esse tipo de pedido.'
        break
    }

    // 5. salvar pergunta
    await this.prisma.searchHistory.create({
      data: {
        userId,
        query: message,
        intent,
        reply,
        canonicalTerm,
        category,
      },
    })

    // 6. incrementar uso
    await this.usageService.increment(userId)

    // 7. resposta (V1 simples)
    return {
      intent,
      reply,
      products,
      trending,
      context: {
        profile: user.profile,
        history,
      },
    }
  }
}