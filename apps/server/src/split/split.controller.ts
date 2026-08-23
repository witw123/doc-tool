import { Controller, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { SplitService } from './split.service';
import {
  FilenamePreviewRequest,
  FilenamePreviewResponse,
  FilenameExportRequest,
} from '@doc-tool/shared';

@Controller('filename-split')
export class SplitController {
  constructor(private readonly splitService: SplitService) {}

  @Post('preview')
  preview(@Body() request: FilenamePreviewRequest): FilenamePreviewResponse {
    return this.splitService.preview(request);
  }

  @Post('export')
  async exportXlsx(@Body() request: FilenameExportRequest, @Res() res: Response) {
    const result = await this.splitService.exportXlsx(request);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.filename)}"`,
    );
    res.setHeader('X-File-Count', String(result.file_count));
    res.setHeader('X-Leaf-Count', String(result.leaf_count));

    return res.send(result.buffer);
  }
}
