import { Module } from '@nestjs/common';
import { ScannerModule } from './scanner/scanner.module';
import { ComparatorModule } from './comparator/comparator.module';
import { BrowserModule } from './browser/browser.module';
import { SystemModule } from './system/system.module';
import { SplitModule } from './split/split.module';

@Module({
  imports: [
    ScannerModule,
    ComparatorModule,
    BrowserModule,
    SystemModule,
    SplitModule,
  ],
})
export class AppModule {}
