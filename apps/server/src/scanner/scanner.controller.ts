import { Controller, Post, Body } from '@nestjs/common';
import { ScannerService } from './scanner.service';
import { ScanRequest, ScanResponse } from '@doc-tool/shared';

@Controller('scan')
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Post()
  async scan(@Body() request: ScanRequest): Promise<ScanResponse> {
    return this.scannerService.scan(request);
  }
}
