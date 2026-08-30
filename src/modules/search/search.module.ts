import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { searchClient } from "./search.client";
import { ProductSearchService } from "./product-search.service";

@Module({
    imports: [AiModule],
    providers: [searchClient, ProductSearchService],
    exports: [ProductSearchService, searchClient]
})

export class searchModule {}