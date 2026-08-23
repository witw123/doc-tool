import { Module } from '@nestjs/common';
import { ComparatorService } from './comparator.service';
import { ComparatorController } from './comparator.controller';

@Module({
  controllers: [ComparatorController],
  providers: [ComparatorService],
  exports: [ComparatorService],
})
export class ComparatorModule {}
