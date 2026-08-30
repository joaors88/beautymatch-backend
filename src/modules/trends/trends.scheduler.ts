import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { TrendsCollectorService } from './trends-collector.service'
import { TrendsCalculatorService } from './trends-calculator.service'

/**
 * Orquestra o pipeline diário: coleta e, em seguida, cálculo.
 *
 * A sequência mora aqui e não dentro dos serviços para que o coletor não conheça
 * o calculador nem o contrário — um toca rede, o outro é computação pura.
 */
@Injectable()
export class TrendsScheduler {
    private readonly logger = new Logger(TrendsScheduler.name)

    constructor(
        private readonly collector: TrendsCollectorService,
        private readonly calculator: TrendsCalculatorService,
    ) {}

    @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'America/Sao_Paulo' })
    async handleDailyRun(): Promise<void> {
        this.logger.log('Iniciando pipeline diário de tendências')

        try {
            const coleta = await this.collector.collect()
            this.logger.log(
                `Coleta: ${coleta.saved} termos de ${coleta.suggestions} sugestões ` +
                `(${coleta.prefixesOk} prefixos ok, ${coleta.prefixesFail} falharam, IA=${coleta.usedAi})`,
            )
        } catch (error) {
            // mesmo sem coleta nova, recalcular sobre a janela existente é útil
            this.logger.error('Coleta falhou — seguindo para o cálculo com os dados existentes', error)
        }

        try {
            const calculo = await this.calculator.calculate()
            this.logger.log(
                `Cálculo: ${calculo.terms} termos sobre ${calculo.captures} capturas ` +
                `(${calculo.rising} em alta, ${calculo.stable} estáveis, ${calculo.falling} em queda)`,
            )
        } catch (error) {
            this.logger.error('Cálculo de tendências falhou', error)
        }
    }
}
