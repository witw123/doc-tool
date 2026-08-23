import { Module } from '@nestjs/common';
import { SplitService } from './split.service';
import { SplitController } from './split.controller';

@Module({
  controllers: [SplitController],
  providers: [SplitService],
  exports: [SplitService],
})
export class SplitModule {}
