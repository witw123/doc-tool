import { Controller, Get, Post, Body } from '@nestjs/common';
import { SystemService } from './system.service';
import { OpenFolderRequest, OpenFolderResponse, HealthResponse } from '@doc-tool/shared';

@Controller()
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('health')
  getHealth(): HealthResponse {
    return this.systemService.getHealth();
  }

  @Post('open-system-folder')
  async openSystemFolder(@Body() request: OpenFolderRequest): Promise<OpenFolderResponse> {
    return this.systemService.openSystemFolder(request);
  }
}
