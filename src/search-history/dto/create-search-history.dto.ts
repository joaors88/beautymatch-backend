import { IsNotEmpty, IsString, MaxLength } from "class-validator";


export class CreateSearchHistoryDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    query: string
}