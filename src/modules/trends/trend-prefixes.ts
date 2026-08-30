import { ProductCategory } from '@prisma/client'

/**
 * Prefixos usados no autocomplete do Google, por categoria.
 *
 * O espaço no final é intencional: sem ele o Google completa a palavra em vez de
 * sugerir a continuação.
 *
 * Prefixo genérico demais contamina a coleta. "ácido " trazia ácido muriático e
 * acetilsalicílico; "base para " trazia base para notebook e cama box. Ambos
 * foram ancorados no contexto de beleza.
 */
export const TREND_PREFIXES: Record<ProductCategory, string[]> = {
    SKINCARE_FACIAL: ['sérum para ', 'hidratante facial para ', 'ácido para pele '],
    PROTECAO_SOLAR: ['protetor solar ', 'protetor solar facial para '],
    CABELO: ['shampoo para ', 'máscara capilar ', 'finalizador para '],
    MAQUIAGEM: ['base de maquiagem para ', 'batom ', 'corretivo para '],
    CORPO: ['hidratante corporal para ', 'óleo corporal '],
    PERFUMARIA: ['perfume feminino ', 'perfume masculino '],
}
