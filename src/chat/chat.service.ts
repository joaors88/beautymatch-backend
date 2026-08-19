import { Injectable, ForbiddenException } from '@nestjs/common'
import { UsageService } from '../usage/usage.service'
import { PrismaService } from 'src/modules/prisma/prisma.service'
import { AiClient } from 'src/modules/ai/ai.client'
import { Product, ProductSearchService } from 'src/modules/search/product-search.service'

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usageService: UsageService,
    private readonly aiClient: AiClient,
    private readonly productSearchService: ProductSearchService
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

    let intent = 'OUT_OF_SCOPE'

    try {
        const result = await this.aiClient.classifyIntent(message, historyMessages)

    if (result?.intent) {
        intent = result.intent
     }
    } catch (error) {
        console.error('AI error:', error)
        intent = 'OUT_OF_SCOPE'
    }

    let reply: string

    let products: Product[] = []

    switch (intent) {
      case 'OUT_OF_SCOPE':
        reply = 'Desculpe, só posso ajudar com assuntos de beleza - skincare, maquiagem, cabelo, perfumaria e cuidados pessoais.'
          break

      case 'EDUCATION':
        reply = await this.aiClient.generateEducation(message, historyMessages)
          break

      case 'RECOMMENDATION':
        reply = await this.aiClient.generateRecommendation(message, user.profile, historyMessages)
          break

      case 'PRODUCT_COMPARISON':
        reply = await this.aiClient.generationComparison(message, user.profile, historyMessages)
          break        

      case 'PRODUCT_SEARCH': {
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
      },
    })

    // 6. incrementar uso
    await this.usageService.increment(userId)

    // 7. resposta (V1 simples)
    return {
      intent,
      reply,
      products,
      context: {
        profile: user.profile,
        history,
      },
    }
  }
}