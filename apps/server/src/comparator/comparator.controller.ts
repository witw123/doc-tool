import { Controller, Post, Body } from '@nestjs/common';
import { ComparatorService } from './comparator.service';
import { CompareRequest, CompareResponse } from '@doc-tool/shared';

@Controller('compare')
export class ComparatorController {
  constructor(private readonly comparatorService: ComparatorService) {}

  @Post()
  async compare(@Body() request: CompareRequest): Promise<CompareResponse> {
    return this.comparatorService.compare(request);
  }
}
