import { Controller, Get, Query } from '@nestjs/common';
import { BrowserService } from './browser.service';
import { BrowseResponse } from '@doc-tool/shared';

@Controller('browse')
export class BrowserController {
  constructor(private readonly browserService: BrowserService) {}

  @Get()
  browse(@Query('path') pathQuery?: string): BrowseResponse {
    return this.browserService.browse(pathQuery);
  }
}
