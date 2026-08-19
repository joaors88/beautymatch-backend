import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

@Injectable()
export class searchClient {
    private apiKey: string

    constructor(private readonly config: ConfigService) {
        this.apiKey = this.config.getOrThrow<string>('SERPER_DEV_KEY')
    }

    async searchShopping(query: string): Promise<any[]> {
        const response = await axios.post(
            'https://google.serper.dev/shopping',
            { q: query, gl: 'br', hl: 'pt' },
            {
                headers: {
                    'X-API-KEY': this.apiKey,
                    'Content-Type': 'application/json',
                }
            }
        )


        return response.data.shopping ?? []
    }
}